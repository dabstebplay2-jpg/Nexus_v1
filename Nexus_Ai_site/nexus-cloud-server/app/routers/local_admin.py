"""Админка: локально (UI) и/или на Render (API для всех пользователей сайта)."""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import (
    NEXUS_ADMIN_ALLOW_REMOTE,
    NEXUS_ADMIN_DEFAULT_CLOUD_URL,
    NEXUS_ADMIN_PASSWORD,
    NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD,
    NEXUS_LOCAL_ADMIN,
    NEXUS_REMOTE_ADMIN,
    OPENROUTER_API_KEY,
    OPENROUTER_FREE_KEY_LIMIT_RESET,
    POLZA_BACKEND_API_KEY,
    admin_api_enabled,
    database_backend,
    is_testing_mode,
    openrouter_management_enabled,
)
from app.database import InvoiceDB, TransactionDB, UserDB, get_db
from app.schemas import AdminSupportReply, AdminSupportStatusPatch
from app.services.admin_analytics import (
    analytics_registrations,
    analytics_revenue,
    analytics_summary,
    analytics_tiers,
)
from app.services.admin_audit import get_admin_actions, get_server_logs, log_admin_action
from app.services.admin_user_ops import (
    admin_delete_user,
    admin_grant_tier,
    admin_refresh_openrouter,
    admin_refresh_routerai,
    admin_reset_password,
    admin_revoke_tier,
    admin_save_user,
    admin_unlink_google,
    admin_unlink_telegram,
)
from app.services.auth_bruteforce import (
    assert_admin_not_locked_out,
    record_failed_admin,
    reset_admin_attempts,
)
from app.services.openrouter_provision import user_has_openrouter_key
from app.services.platform_funding import (
    compute_funding_metrics,
    refresh_polza_org_balance,
    set_polza_org_balance_rub,
)
from app.services.polza import user_has_polza_key
from app.services.polza_balance_cron import run_polza_balance_check
from app.services.quota_limits import get_quota_limit_info
from app.services.routerai_pool_monitor import get_polza_pool_status
from app.tiers import (
    normalize_tier,
    tier_requires_payment,
    tier_uses_openrouter_free,
)

_ADMIN_PROBE_PASSWORD = "__probe__"

router = APIRouter(prefix="/v1/local-admin", tags=["local-admin"])

_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _client_host(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host or ""
    return ""


def require_admin_access(
    request: Request,
    x_admin_password: str = Header(..., alias="X-Admin-Password"),
) -> None:
    if not admin_api_enabled():
        raise HTTPException(status_code=404, detail="Admin API disabled")
    if not NEXUS_ADMIN_PASSWORD:
        raise HTTPException(
            status_code=503,
            detail="Set NEXUS_ADMIN_PASSWORD in environment and restart.",
        )
    client_ip = _client_host(request)
    assert_admin_not_locked_out(client_ip)
    if secrets.compare_digest(x_admin_password, NEXUS_ADMIN_PASSWORD):
        reset_admin_attempts(client_ip)
    elif x_admin_password != _ADMIN_PROBE_PASSWORD:
        record_failed_admin(client_ip)
        raise HTTPException(status_code=403, detail="Wrong admin password")
    else:
        raise HTTPException(status_code=401, detail="Wrong admin password")
    if NEXUS_REMOTE_ADMIN:
        return
    host = client_ip
    if not NEXUS_ADMIN_ALLOW_REMOTE and host not in _LOCAL_HOSTS:
        raise HTTPException(
            status_code=403,
            detail=f"Admin API is localhost-only (request from {host!r}). "
            "On Render set NEXUS_REMOTE_ADMIN=true for cloud users.",
        )


def _dt_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


def _mask_polza_key_id(key_id: str | None) -> str | None:
    k = (key_id or "").strip()
    if not k:
        return None
    if len(k) < 10:
        return k
    return f"{k[:6]}…{k[-4:]}"


def _is_tg_shadow_email(email: str | None) -> bool:
    return (email or "").strip().lower().endswith("@tg.nexus")


def _mask_google_sub(sub: str | None) -> str | None:
    s = (sub or "").strip()
    if len(s) < 8:
        return None
    return f"{s[:4]}…{s[-4:]}"


def _user_summary(db: Session, user: UserDB) -> dict[str, Any]:
    tier = normalize_tier(user.subscription_tier)
    quota = get_quota_limit_info(db, user)
    has_polza = user_has_polza_key(user)
    polza_key_id = getattr(user, "polza_key_id", None)
    paid = tier_requires_payment(tier)
    polza_ready = bool(has_polza and paid and quota.get("quota_enabled"))
    has_openrouter = user_has_openrouter_key(user)
    openrouter_hash = getattr(user, "openrouter_key_hash", None)
    openrouter_ready = bool(tier_uses_openrouter_free(tier) and has_openrouter)
    openrouter_shared = bool(
        tier_uses_openrouter_free(tier)
        and not has_openrouter
        and bool(OPENROUTER_API_KEY or openrouter_management_enabled())
    )
    email = user.email or ""
    google_sub = getattr(user, "google_sub", None)
    return {
        "id": user.id,
        "email": email,
        "subscription_tier": tier,
        "balance_usd": round(float(user.balance or 0), 6),
        "has_polza_key": has_polza,
        "polza_key_id": polza_key_id,
        "polza_key_preview": _mask_polza_key_id(polza_key_id),
        "polza_ready": polza_ready,
        "has_openrouter_key": has_openrouter,
        "openrouter_key_hash_preview": _mask_polza_key_id(openrouter_hash),
        "openrouter_key_created_at": _dt_iso(getattr(user, "openrouter_key_created_at", None)),
        "openrouter_ready": openrouter_ready,
        "openrouter_uses_shared_key": openrouter_shared,
        "created_at": _dt_iso(user.created_at),
        "subscription_period_start": _dt_iso(getattr(user, "subscription_period_start", None)),
        "subscription_period_end": _dt_iso(getattr(user, "subscription_period_end", None)),
        "monthly_cap_usd": quota.get("cap_usd"),
        "monthly_spent_usd": quota.get("spent_usd"),
        "monthly_remaining_usd": quota.get("remaining_usd"),
        "quota_enabled": quota.get("quota_enabled"),
        "telegram_id": int(user.telegram_id) if getattr(user, "telegram_id", None) else None,
        "telegram_username": getattr(user, "telegram_username", None),
        "telegram_linked": bool(getattr(user, "telegram_id", None)),
        "has_google": bool(google_sub),
        "google_sub_preview": _mask_google_sub(google_sub),
        "auth_methods": (getattr(user, "auth_methods", None) or "").strip() or None,
        "email_verified": bool(getattr(user, "email_verified_at", None)),
        "is_tg_shadow": _is_tg_shadow_email(email),
    }


class TierBody(BaseModel):
    tier: str


class BalanceBody(BaseModel):
    balance_usd: float = Field(..., ge=0)


class RouteraiDepositBody(BaseModel):
    deposit_usd: float | None = Field(None, ge=0)
    deposit_rub: float | None = Field(None, ge=0)


class PasswordBody(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class EmailBody(BaseModel):
    email: EmailStr


class BulkUserIdsBody(BaseModel):
    user_ids: list[int] = Field(..., min_length=1, max_length=200)


class UserSaveBody(BaseModel):
    email: EmailStr | None = None
    subscription_tier: str | None = None
    balance_usd: float | None = Field(None, ge=0)
    new_password: str | None = Field(None, min_length=6, max_length=128)
    refresh_polza: bool = False
    refresh_routerai: bool = False
    refresh_openrouter: bool = False


@router.get("/site-overview")
def site_overview(db: Session = Depends(get_db), _: None = Depends(require_admin_access)):
    """Сводка по всему сайту для админки."""
    total = db.query(func.count(UserDB.id)).scalar() or 0
    with_polza = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.polza_key_id.isnot(None))
        .scalar()
        or 0
    )
    with_openrouter = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.openrouter_api_key_encrypted.isnot(None))
        .scalar()
        or 0
    )
    paid = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.subscription_tier != "FREE")
        .scalar()
        or 0
    )
    return {
        "users_total": total,
        "users_with_polza_key": with_polza,
        "users_with_openrouter_key": with_openrouter,
        "users_paid_tier": paid,
        "frontend_url": "https://nexus-zeta-ruby-12.vercel.app",
        "cloud_url": NEXUS_ADMIN_DEFAULT_CLOUD_URL,
        "polza_backend_configured": bool(POLZA_BACKEND_API_KEY),
        "openrouter_management_configured": openrouter_management_enabled(),
        "remote_admin": NEXUS_REMOTE_ADMIN,
        "testing_mode": is_testing_mode(),
    }


@router.get("/routerai/verify-master")
@router.get("/polza/verify-backend")
async def verify_polza_backend(_: None = Depends(require_admin_access)):
    from app.config import POLZA_BACKEND_API_KEY
    from app.services.polza import PolzaService

    if not POLZA_BACKEND_API_KEY:
        raise HTTPException(status_code=503, detail="POLZA_BACKEND_API_KEY не задан на сервере")
    result = await PolzaService().verify_backend_key()
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=result.get("message", "Backend-ключ не работает"))
    return result


@router.get("/status")
async def admin_status(_: None = Depends(require_admin_access)):
    from app.config import POLZA_BACKEND_API_KEY
    from app.services.polza import PolzaService

    polza_check = {"ok": False, "message": "POLZA_BACKEND_API_KEY не задан"}
    if POLZA_BACKEND_API_KEY:
        polza_check = await PolzaService().verify_backend_key()
    return {
        "local_admin": NEXUS_LOCAL_ADMIN,
        "remote_admin": NEXUS_REMOTE_ADMIN,
        "database": database_backend(),
        "polza_backend_configured": bool(POLZA_BACKEND_API_KEY),
        "polza_backend_valid": bool(polza_check.get("ok")),
        "polza_backend_hint": polza_check.get("message"),
        "testing_mode": is_testing_mode(),
        "allow_remote": NEXUS_ADMIN_ALLOW_REMOTE or NEXUS_REMOTE_ADMIN,
    }


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: None = Depends(require_admin_access)):
    total = db.query(func.count(UserDB.id)).scalar() or 0
    by_tier = (
        db.query(UserDB.subscription_tier, func.count(UserDB.id))
        .group_by(UserDB.subscription_tier)
        .all()
    )
    tx_count = db.query(func.count(TransactionDB.id)).scalar() or 0
    inv_pending = (
        db.query(func.count(InvoiceDB.id)).filter(InvoiceDB.status == "pending").scalar() or 0
    )
    recent = (
        db.query(UserDB).order_by(UserDB.created_at.desc()).limit(8).all()
    )
    return {
        "users_total": total,
        "users_by_tier": {normalize_tier(t or "FREE"): c for t, c in by_tier},
        "transactions_total": tx_count,
        "invoices_pending": inv_pending,
        "recent_users": [_user_summary(db, u) for u in recent],
    }


@router.get("/users")
def list_users(
    q: str | None = Query(None),
    tier: str | None = Query(None),
    shadow_only: bool = Query(False),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    query = db.query(UserDB)
    if q:
        needle = q.strip().lstrip("@")
        query = query.filter(
            or_(
                UserDB.email.ilike(f"%{needle}%"),
                UserDB.telegram_username.ilike(f"%{needle}%"),
            )
        )
    if shadow_only:
        query = query.filter(UserDB.email.ilike("%@tg.nexus"))
    if tier:
        query = query.filter(UserDB.subscription_tier == normalize_tier(tier))
    total = query.count()
    users = query.order_by(UserDB.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_user_summary(db, u) for u in users],
    }


@router.post("/users/bulk-delete")
async def bulk_delete_users(
    body: BulkUserIdsBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    deleted: list[int] = []
    failed: list[dict[str, str | int]] = []
    for uid in body.user_ids:
        user = db.query(UserDB).filter(UserDB.id == int(uid)).first()
        if not user:
            failed.append({"id": int(uid), "error": "not_found"})
            continue
        email = user.email
        try:
            await admin_delete_user(db, user)
            deleted.append(int(uid))
        except Exception as exc:
            failed.append({"id": int(uid), "email": email, "error": str(exc)})
    log_admin_action(
        "bulk_delete_users",
        f"deleted={len(deleted)} failed={len(failed)}",
        count=len(deleted),
    )
    return {"status": "ok", "deleted": deleted, "failed": failed}


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    txs = (
        db.query(TransactionDB)
        .filter(TransactionDB.user_id == user_id)
        .order_by(TransactionDB.created_at.desc())
        .limit(50)
        .all()
    )
    invs = (
        db.query(InvoiceDB)
        .filter(InvoiceDB.user_id == user_id)
        .order_by(InvoiceDB.created_at.desc())
        .limit(30)
        .all()
    )
    return {
        "user": _user_summary(db, user),
        "transactions": [
            {
                "id": t.id,
                "amount_usd": t.amount,
                "tx_type": t.tx_type,
                "description": t.description,
                "created_at": _dt_iso(t.created_at),
            }
            for t in txs
        ],
        "invoices": [
            {
                "id": i.id,
                "amount_rub": i.amount_rub,
                "status": i.status,
                "created_at": _dt_iso(i.created_at),
            }
            for i in invs
        ],
    }


@router.post("/users/{user_id}/grant-tier")
async def grant_tier(
    user_id: int,
    body: TierBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    tier = normalize_tier(body.tier)
    if tier == "FREE":
        await admin_revoke_tier(db, user)
        return {"status": "ok", "user": _user_summary(db, user)}
    result = await admin_grant_tier(db, user, tier)
    db.refresh(user)
    return {"status": "ok", "user": _user_summary(db, user), "result": result}


@router.post("/users/{user_id}/revoke-tier")
async def revoke_tier(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await admin_revoke_tier(db, user)
    return {"status": "ok", "user": _user_summary(db, user)}


@router.post("/users/{user_id}/repair-polza")
@router.post("/users/{user_id}/repair-routerai")
@router.post("/users/{user_id}/refresh-polza")
@router.post("/users/{user_id}/refresh-routerai")
async def repair_polza_key(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    ok = await admin_refresh_routerai(db, user)
    if not ok:
        raise HTTPException(status_code=503, detail="Не удалось создать или обновить ключ Polza")
    return {"status": "ok", "user": _user_summary(db, user)}


@router.post("/users/{user_id}/repair-openrouter")
@router.post("/users/{user_id}/refresh-openrouter")
async def repair_openrouter_key(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    try:
        ok = await admin_refresh_openrouter(db, user)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Не удалось создать или обновить ключ OpenRouter (нужен тариф FREE)",
        )
    return {"status": "ok", "user": _user_summary(db, user)}


@router.put("/users/{user_id}")
@router.patch("/users/{user_id}")
async def save_user(
    user_id: int,
    body: UserSaveBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    try:
        result = await admin_save_user(
            db,
            user,
            email=str(body.email) if body.email else None,
            subscription_tier=body.subscription_tier,
            balance_usd=body.balance_usd,
            new_password=body.new_password,
            refresh_polza=body.refresh_polza,
            refresh_routerai=body.refresh_routerai,
            refresh_openrouter=body.refresh_openrouter,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.refresh(user)
    return {"status": "ok", "user": _user_summary(db, user), **result}


@router.patch("/users/{user_id}/balance")
def set_balance(
    user_id: int,
    body: BalanceBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.balance = float(body.balance_usd)
    db.commit()
    log_admin_action("set_balance", user.email, user_id=user.id, balance_usd=body.balance_usd)
    return {"status": "ok", "user": _user_summary(db, user)}


@router.patch("/users/{user_id}/email")
def set_email(
    user_id: int,
    body: EmailBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    exists = db.query(UserDB).filter(UserDB.email == body.email, UserDB.id != user_id).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email уже занят")
    user.email = body.email
    db.commit()
    log_admin_action("set_email", body.email, user_id=user.id)
    return {"status": "ok", "user": _user_summary(db, user)}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    body: PasswordBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    admin_reset_password(db, user, body.new_password)
    return {"status": "ok"}


@router.post("/users/{user_id}/unlink-telegram")
def unlink_telegram_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    try:
        admin_unlink_telegram(db, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "user": _user_summary(db, user)}


@router.post("/users/{user_id}/unlink-google")
def unlink_google_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    try:
        admin_unlink_google(db, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "user": _user_summary(db, user)}


@router.get("/analytics/summary")
def analytics_summary_route(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    return analytics_summary(db)


@router.get("/analytics/registrations")
def analytics_registrations_route(
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    return {"days": days, "items": analytics_registrations(db, days=days)}


@router.get("/analytics/tiers")
def analytics_tiers_route(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    return {"items": analytics_tiers(db)}


@router.get("/analytics/revenue")
def analytics_revenue_route(
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    return {"days": days, "items": analytics_revenue(db, days=days)}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await admin_delete_user(db, user)
    return {"status": "deleted", "user_id": user_id}


@router.get("/transactions")
def list_transactions(
    user_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    q = db.query(TransactionDB, UserDB.email).join(UserDB, TransactionDB.user_id == UserDB.id)
    if user_id is not None:
        q = q.filter(TransactionDB.user_id == user_id)
    rows = q.order_by(TransactionDB.id.desc()).limit(limit).all()
    return {
        "items": [
            {
                "id": t.id,
                "user_id": t.user_id,
                "email": email,
                "amount_usd": t.amount,
                "tx_type": t.tx_type,
                "description": t.description,
                "created_at": _dt_iso(t.created_at),
            }
            for t, email in rows
        ]
    }


@router.get("/invoices")
def list_invoices(
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    q = db.query(InvoiceDB, UserDB.email).join(UserDB, InvoiceDB.user_id == UserDB.id)
    if status:
        q = q.filter(InvoiceDB.status == status)
    rows = q.order_by(InvoiceDB.created_at.desc()).limit(limit).all()
    return {
        "items": [
            {
                "id": i.id,
                "user_id": i.user_id,
                "email": email,
                "amount_rub": i.amount_rub,
                "status": i.status,
                "subscription_tier": getattr(i, "subscription_tier", None),
                "created_at": _dt_iso(i.created_at),
            }
            for i, email in rows
        ]
    }


@router.get("/logs/server")
def server_logs(
    limit: int = Query(200, ge=1, le=1000),
    level: str | None = Query(None),
    q: str | None = Query(None),
    _: None = Depends(require_admin_access),
):
    return {"items": get_server_logs(limit=limit, level=level, q=q)}


@router.get("/logs/admin-actions")
def admin_action_logs(
    limit: int = Query(100, ge=1, le=500),
    _: None = Depends(require_admin_access),
):
    return {"items": get_admin_actions(limit=limit)}


@router.get("/support/tickets")
def admin_list_support_tickets(
    status: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    _: None = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    from app.schemas import AdminSupportTicketListResponse, AdminSupportTicketSummary
    from app.services.support_service import list_admin_tickets

    items = list_admin_tickets(db, status=status, q=q, limit=limit)
    return AdminSupportTicketListResponse(
        tickets=[AdminSupportTicketSummary(**t) for t in items]
    )


@router.get("/support/tickets/{ticket_id}")
def admin_get_support_ticket(
    ticket_id: str,
    _: None = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    from app.schemas import AdminSupportTicketDetail
    from app.services.support_service import get_admin_ticket_detail

    return AdminSupportTicketDetail(**get_admin_ticket_detail(db, ticket_id))


@router.post("/support/tickets/{ticket_id}/reply")
def admin_reply_support_ticket(
    ticket_id: str,
    body: AdminSupportReply,
    _: None = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    from app.schemas import SupportMessageOut
    from app.services.admin_audit import log_admin_action
    from app.services.support_service import _message_out, add_admin_reply

    msg = add_admin_reply(
        db,
        ticket_id,
        body=body.body,
        attachments=body.attachments,
    )
    log_admin_action("support_reply", ticket_id=ticket_id)
    return SupportMessageOut(**_message_out(msg))


@router.patch("/support/tickets/{ticket_id}")
def admin_patch_support_ticket(
    ticket_id: str,
    body: AdminSupportStatusPatch,
    _: None = Depends(require_admin_access),
    db: Session = Depends(get_db),
):
    from app.schemas import AdminSupportTicketDetail
    from app.services.admin_audit import log_admin_action
    from app.services.support_service import get_admin_ticket_detail, set_ticket_status

    set_ticket_status(db, ticket_id, body.status)
    log_admin_action("support_status", ticket_id=ticket_id, status=body.status)
    return AdminSupportTicketDetail(**get_admin_ticket_detail(db, ticket_id))


@router.get("/openrouter/status")
def openrouter_status(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    """Статус per-user ключей OpenRouter (FREE tier)."""
    users_with_key = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.openrouter_api_key_encrypted.isnot(None))
        .scalar()
        or 0
    )
    return {
        "management_configured": openrouter_management_enabled(),
        "shared_fallback_configured": bool(OPENROUTER_API_KEY),
        "users_with_key": int(users_with_key),
        "free_key_limit_usd": NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD,
        "limit_reset": OPENROUTER_FREE_KEY_LIMIT_RESET,
    }


@router.post("/openrouter/verify-management")
async def verify_openrouter_management(_: None = Depends(require_admin_access)):
    from app.services.openrouter import OpenRouterError, OpenRouterService

    if not openrouter_management_enabled():
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_MANAGEMENT_API_KEY не задан на сервере",
        )
    try:
        result = await OpenRouterService().verify_management_key()
    except OpenRouterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return result


@router.get("/polza/pool-status")
@router.get("/routerai/pool-status")
async def polza_pool_status(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    """Сумма пулов подписчиков и статус ключей Polza."""
    return await get_polza_pool_status(db)


@router.get("/platform/funding")
def platform_funding_summary(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    """ЮKassa за месяц, зарезервированные пулы, баланс org Polza, рекомендация пополнения."""
    return compute_funding_metrics(db)


@router.patch("/platform/polza-deposit")
@router.patch("/platform/routerai-deposit")
def patch_polza_deposit(
    body: RouteraiDepositBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    """Обновить учётный баланс org Polza (₽) после пополнения на polza.ai."""
    if body.deposit_rub is not None:
        balance_rub = body.deposit_rub
    elif body.deposit_usd is not None:
        from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub

        balance_rub = usd_to_rub(body.deposit_usd, get_usd_rub_rate_sync())
    else:
        raise HTTPException(status_code=400, detail="Укажите deposit_rub или deposit_usd")
    row = set_polza_org_balance_rub(db, balance_rub)
    log_admin_action("polza_balance", balance_rub=balance_rub)
    return {
        "status": "ok",
        "polza_org_balance_rub": row.polza_org_balance_rub,
        "funding": compute_funding_metrics(db),
    }


@router.post("/platform/funding-check")
async def platform_funding_check_now(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_access),
):
    """Ручной запуск проверки депозита (как cron) + Discord ops при нехватке."""
    await refresh_polza_org_balance(db)
    return await run_polza_balance_check(db)
