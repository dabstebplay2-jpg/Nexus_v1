"""Мониторинг: пулы подписчиков и баланс org Polza.ai."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import POLZA_BACKEND_API_KEY, TIER_POOL_FRACTION
from app.database import InvoiceDB, UserDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.invoice_pool import get_user_period_pool_usd
from app.services.polza import PolzaService, user_has_polza_key
from app.tiers import normalize_tier, tier_monthly_cap, tier_requires_payment

logger = logging.getLogger(__name__)


def _active_paid_users(db: Session) -> list[UserDB]:
    rows = db.query(UserDB).all()
    out: list[UserDB] = []
    for user in rows:
        tier = normalize_tier(user.subscription_tier)
        if tier_requires_payment(tier):
            out.append(user)
    return out


def aggregate_user_pool_usd(db: Session) -> dict[str, Any]:
    """Сумма пулов ИИ по активным платным подписчикам (из счетов или каталога)."""
    total = 0.0
    users: list[dict[str, Any]] = []
    for user in _active_paid_users(db):
        pool = get_user_period_pool_usd(db, user) or tier_monthly_cap(
            normalize_tier(user.subscription_tier)
        )
        total += pool
        users.append(
            {
                "user_id": user.id,
                "email": user.email,
                "tier": normalize_tier(user.subscription_tier),
                "pool_usd": round(pool, 4),
                "has_polza_key": user_has_polza_key(user),
            }
        )
    rate = get_usd_rub_rate_sync()
    return {
        "active_subscribers": len(users),
        "total_pool_usd": round(total, 4),
        "total_pool_rub": usd_to_rub(total, rate),
        "pool_fraction": TIER_POOL_FRACTION,
        "usd_rub_rate": rate,
        "users": users,
        "polza_connected": sum(1 for u in users if u.get("has_polza_key")),
    }


async def get_polza_pool_status(db: Session) -> dict[str, Any]:
    """Сводка для админки: пулы подписчиков + баланс org Polza."""
    from app.services.platform_funding import compute_funding_metrics, refresh_polza_org_balance

    await refresh_polza_org_balance(db)
    funding = compute_funding_metrics(db)
    user_pools = aggregate_user_pool_usd(db)
    paid_invoices = (
        db.query(InvoiceDB)
        .filter(InvoiceDB.status == "paid", InvoiceDB.id.like("sub_%"))
        .count()
    )
    out: dict[str, Any] = {
        **user_pools,
        "funding": funding,
        "paid_subscription_invoices": paid_invoices,
        "polza_backend_configured": bool(POLZA_BACKEND_API_KEY),
        "polza_backend": None,
        "warnings": [],
    }

    if not funding.get("funding_ok"):
        out["warnings"].append(
            f"Баланс org Polza {funding.get('polza_org_balance_rub', 0):,.0f} ₽ — нужно под пулы "
            f"{funding.get('required_balance_rub', 0):,.0f} ₽. Пополните polza.ai ≈ "
            f"{funding.get('recommended_topup_rub', 0):,.0f} ₽."
            .replace(",", " ")
        )

    if not POLZA_BACKEND_API_KEY:
        out["warnings"].append("POLZA_BACKEND_API_KEY не задан — мониторинг org-баланса недоступен.")

    try:
        check = await PolzaService().verify_backend_key()
        out["polza_backend"] = check
    except Exception as exc:
        out["polza_backend"] = {"ok": False, "message": str(exc)}
        out["warnings"].append(f"Не удалось проверить backend Polza: {exc}")

    pending_keys = sum(1 for u in _active_paid_users(db) if not user_has_polza_key(u))
    if pending_keys:
        out["warnings"].append(
            f"{pending_keys} платных подписчик(ов) без ключа Polza — запустите repair или обновите ключ в админке."
        )

    return out


async def get_routerai_pool_status(db: Session) -> dict[str, Any]:
    """Legacy alias."""
    return await get_polza_pool_status(db)
