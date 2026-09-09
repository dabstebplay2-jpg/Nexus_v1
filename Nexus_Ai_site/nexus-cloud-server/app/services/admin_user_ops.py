"""Операции админки над пользователями."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.config import openrouter_management_enabled
from app.database import (
    AuthExchangeCodeDB,
    BrowserSyncDB,
    ChatConversationDB,
    ConnectorAuditLogDB,
    ConnectorOAuthStateDB,
    InvoiceDB,
    OAuthPkceSessionDB,
    PlatformFundingObligationDB,
    SupportMessageDB,
    SupportTicketDB,
    TransactionDB,
    UserArtifactDB,
    UserConnectionDB,
    UserDB,
    UserMemoryDB,
    WorkspaceDB,
    hash_password,
)
from app.services.admin_audit import log_admin_action
from app.services.detailed_log import get_logger, log_detail, mask_hash
from app.services.openrouter_provision import (
    delete_openrouter_key_for_user,
    provision_openrouter_for_user,
    user_has_openrouter_key,
)
from app.services.polza import suspend_polza_for_user, user_has_polza_key
from app.services.polza_mcp import PolzaMcpError, mcp_delete_api_key, mcp_quarantine_api_key
from app.services.subscription_activate import activate_paid_tier
from app.services.subscription_audit_log import log_tier_revoked_by_admin
from app.services.subscription_guard import revoke_admin_subscription_invoices
from app.services.telegram_link import release_telegram_binding
from app.tiers import (
    normalize_tier,
    tier_monthly_cap,
    tier_requires_payment,
    tier_uses_openrouter_free,
)

_ops_log = get_logger("admin")


async def admin_grant_tier(db: Session, user: UserDB, tier: str) -> dict:
    tier = normalize_tier(tier)
    previous = normalize_tier(user.subscription_tier)
    result = await activate_paid_tier(
        db, user, tier, grant_source="admin", previous_tier=previous
    )
    log_admin_action("grant_tier", user.email, user_id=user.id, tier=tier, from_tier=previous)
    return result


async def admin_revoke_tier(db: Session, user: UserDB) -> None:
    previous = normalize_tier(user.subscription_tier)
    log_tier_revoked_by_admin(user, previous_tier=previous)
    user.subscription_tier = "FREE"
    user.subscription_period_start = None
    user.subscription_period_end = None
    user.balance = 0.0
    revoke_admin_subscription_invoices(db, user)
    await suspend_polza_for_user(user, db)
    db.commit()
    db.refresh(user)
    log_admin_action("revoke_tier", user.email, user_id=user.id)


def _remove_auth_method(user: UserDB, method: str) -> None:
    raw = (getattr(user, "auth_methods", None) or "").strip()
    parts = [p.strip() for p in raw.split(",") if p.strip() and p.strip() != method]
    user.auth_methods = ",".join(parts) if parts else None


def admin_unlink_telegram(db: Session, user: UserDB) -> None:
    if not getattr(user, "telegram_id", None):
        raise ValueError("Telegram не привязан к этому аккаунту")
    tg_username = getattr(user, "telegram_username", None)
    tg_id = int(user.telegram_id)
    release_telegram_binding(db, user)
    _remove_auth_method(user, "telegram")
    db.commit()
    db.refresh(user)
    log_admin_action(
        "unlink_telegram",
        user.email,
        user_id=user.id,
        telegram_id=tg_id,
        telegram_username=tg_username,
    )


def admin_unlink_google(db: Session, user: UserDB) -> None:
    if not getattr(user, "google_sub", None):
        raise ValueError("Google не привязан к этому аккаунту")
    user.google_sub = None
    _remove_auth_method(user, "google")
    db.commit()
    db.refresh(user)
    log_admin_action("unlink_google", user.email, user_id=user.id)


def purge_user_data(db: Session, user_id: int) -> None:
    """Удалить все связанные с пользователем строки перед удалением users."""
    ticket_ids = [
        row[0]
        for row in db.query(SupportTicketDB.id).filter(SupportTicketDB.user_id == user_id).all()
    ]
    if ticket_ids:
        db.query(SupportMessageDB).filter(SupportMessageDB.ticket_id.in_(ticket_ids)).delete(
            synchronize_session=False
        )
    db.query(SupportTicketDB).filter(SupportTicketDB.user_id == user_id).delete(synchronize_session=False)
    db.query(ChatConversationDB).filter(ChatConversationDB.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(WorkspaceDB).filter(WorkspaceDB.user_id == user_id).delete(synchronize_session=False)
    db.query(UserArtifactDB).filter(UserArtifactDB.user_id == user_id).delete(synchronize_session=False)
    db.query(UserMemoryDB).filter(UserMemoryDB.user_id == user_id).delete(synchronize_session=False)
    db.query(BrowserSyncDB).filter(BrowserSyncDB.user_id == user_id).delete(synchronize_session=False)
    db.query(UserConnectionDB).filter(UserConnectionDB.user_id == user_id).delete(synchronize_session=False)
    db.query(ConnectorOAuthStateDB).filter(ConnectorOAuthStateDB.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ConnectorAuditLogDB).filter(ConnectorAuditLogDB.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(AuthExchangeCodeDB).filter(AuthExchangeCodeDB.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(OAuthPkceSessionDB).filter(OAuthPkceSessionDB.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(PlatformFundingObligationDB).filter(
        PlatformFundingObligationDB.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(TransactionDB).filter(TransactionDB.user_id == user_id).delete(synchronize_session=False)
    db.query(InvoiceDB).filter(InvoiceDB.user_id == user_id).delete(synchronize_session=False)


async def admin_delete_user(db: Session, user: UserDB) -> None:
    email = user.email
    uid = user.id
    try:
        await delete_openrouter_key_for_user(user, db)
    except Exception as exc:
        _ops_log.warning("OpenRouter key delete failed for user_id=%s: %s", uid, exc)

    polza_key_id = getattr(user, "polza_key_id", None)
    if polza_key_id:
        try:
            deleted = await mcp_delete_api_key(key_id=str(polza_key_id))
            if not deleted:
                await mcp_quarantine_api_key(key_id=str(polza_key_id))
        except PolzaMcpError as exc:
            _ops_log.warning(
                "Polza key delete failed for user_id=%s key=%s: %s", uid, polza_key_id, exc
            )
            log_admin_action(
                "delete_user_polza_key_failed",
                email,
                user_id=uid,
                meta={"polza_key_id": str(polza_key_id), "error": str(exc)[:200]},
            )

    purge_user_data(db, uid)
    db.delete(user)
    db.commit()
    log_admin_action("delete_user", email, user_id=uid)


def admin_reset_password(db: Session, user: UserDB, new_password: str) -> None:
    user.hashed_password = hash_password(new_password)
    user.refresh_token = None
    db.commit()
    log_admin_action("reset_password", user.email, user_id=user.id)


async def admin_refresh_polza(db: Session, user: UserDB) -> bool:
    """Автовыдача / пересоздание ключа Polza для пользователя."""
    from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
    from app.services.polza import (
        PolzaService,
        provision_polza_for_user,
        sync_polza_key_limit_after_payment,
    )

    tier = normalize_tier(user.subscription_tier)
    mcp_check = await PolzaService().verify_backend_key()
    if not mcp_check.get("ok"):
        raise ValueError(
            mcp_check.get("message")
            or "POLZA_BACKEND_API_KEY / POLZA_MCP_TOKEN не настроены на сервере"
        )
    if not tier_requires_payment(tier):
        return False
    pool_rub = usd_to_rub(tier_monthly_cap(tier), get_usd_rub_rate_sync())
    ok = await provision_polza_for_user(user, db, pool_rub=pool_rub, force=True)
    if ok:
        await sync_polza_key_limit_after_payment(user, pool_rub=pool_rub)
        db.refresh(user)
        log_admin_action("refresh_polza", user.email, user_id=user.id, tier=tier)
    return ok


async def admin_refresh_routerai(db: Session, user: UserDB) -> bool:
    """Legacy alias."""
    return await admin_refresh_polza(db, user)


async def admin_refresh_openrouter(db: Session, user: UserDB) -> bool:
    """Автовыдача / пересоздание ключа OpenRouter для FREE-пользователя."""
    tier = normalize_tier(user.subscription_tier)
    if not tier_uses_openrouter_free(tier):
        return False
    if not openrouter_management_enabled():
        raise ValueError(
            "OPENROUTER_MANAGEMENT_API_KEY не настроен на сервере"
        )
    ok = await provision_openrouter_for_user(user, db, force=True)
    if ok:
        db.refresh(user)
        log_admin_action("refresh_openrouter", user.email, user_id=user.id, tier=tier)
    return ok


async def admin_save_user(
    db: Session,
    user: UserDB,
    *,
    email: str | None = None,
    subscription_tier: str | None = None,
    balance_usd: float | None = None,
    new_password: str | None = None,
    refresh_polza: bool = False,
    refresh_routerai: bool = False,
    refresh_openrouter: bool = False,
) -> dict[str, Any]:
    """Единое сохранение настроек пользователя из админки."""
    changes: list[str] = []
    warnings: list[str] = []
    log_detail(
        _ops_log,
        "ADMIN: save_user — запрос",
        user_id=user.id,
        email=user.email,
        current_tier=user.subscription_tier,
        current_balance=user.balance,
        requested_email=email,
        requested_tier=subscription_tier,
        requested_balance=balance_usd,
        refresh_polza=refresh_polza or refresh_routerai,
        refresh_openrouter=refresh_openrouter,
        new_password=bool(new_password),
    )

    if email and email.strip().lower() != (user.email or "").lower():
        exists = (
            db.query(UserDB)
            .filter(UserDB.email == email.strip(), UserDB.id != user.id)
            .first()
        )
        if exists:
            raise ValueError("Email уже занят")
        user.email = email.strip()
        changes.append("email")

    if balance_usd is not None:
        user.balance = float(balance_usd)
        changes.append("balance")

    if new_password and len(new_password) >= 6:
        user.hashed_password = hash_password(new_password)
        user.refresh_token = None
        changes.append("password")

    if subscription_tier is not None:
        new_tier = normalize_tier(subscription_tier)
        old_tier = normalize_tier(user.subscription_tier)
        if new_tier != old_tier:
            if new_tier == "FREE":
                await admin_revoke_tier(db, user)
            else:
                await admin_grant_tier(db, user, new_tier)
            changes.append(f"tier:{new_tier}")
            db.refresh(user)
            if tier_requires_payment(new_tier) and not user_has_polza_key(user):
                warnings.append(
                    "Тариф сохранён, но ключ Polza ещё не выдан — нажмите «Обновить ключ Polza»."
                )
            if tier_uses_openrouter_free(new_tier) and not user_has_openrouter_key(user):
                warnings.append(
                    "Тариф FREE: персональный ключ OpenRouter ещё не выдан — нажмите «Обновить ключ OpenRouter»."
                )

    if refresh_polza or refresh_routerai:
        polza_err: str | None = None
        try:
            ok = await admin_refresh_polza(db, user)
            if not ok:
                polza_err = "Не удалось выдать ключ Polza (тариф FREE или MCP не настроен)."
            else:
                changes.append("polza")
        except ValueError as exc:
            polza_err = str(exc)
        if polza_err:
            if changes:
                warnings.append(polza_err)
            else:
                raise ValueError(polza_err)

    if refresh_openrouter:
        openrouter_err: str | None = None
        try:
            ok = await admin_refresh_openrouter(db, user)
            if not ok:
                openrouter_err = (
                    "Не удалось выдать ключ OpenRouter (тариф не FREE или Management API не настроен)."
                )
            else:
                changes.append("openrouter")
        except ValueError as exc:
            openrouter_err = str(exc)
        if openrouter_err:
            if changes:
                warnings.append(openrouter_err)
            else:
                raise ValueError(openrouter_err)

    if any(c in ("email", "balance", "password") for c in changes):
        db.commit()
        db.refresh(user)

    log_admin_action("save_user", user.email, user_id=user.id, changes=",".join(changes) or "noop")
    log_detail(
        _ops_log,
        "ADMIN: save_user — итог",
        user_id=user.id,
        email=user.email,
        tier_after=user.subscription_tier,
        balance_after=user.balance,
        changes=changes,
        warnings=warnings,
        polza_key_id=mask_hash(getattr(user, "polza_key_id", None)),
        has_polza=user_has_polza_key(user),
        has_openrouter=user_has_openrouter_key(user),
    )
    return {"changes": changes, "user_id": user.id, "warnings": warnings}
