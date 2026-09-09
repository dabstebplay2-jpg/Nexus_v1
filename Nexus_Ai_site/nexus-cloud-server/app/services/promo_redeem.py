"""Активация промокода для пользователя."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.database import UserDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.polza import suspend_polza_for_user
from app.services.promo_codes import PromoDef, lookup_promo, promo_codes_enabled
from app.services.quota_limits import get_quota_limit_info
from app.services.subscription_activate import activate_paid_tier
from app.services.subscription_guard import record_admin_subscription_invoice
from app.tiers import normalize_tier, tier_monthly_cap, tier_requires_payment

logger = logging.getLogger(__name__)


async def redeem_promo_code(db: Session, user: UserDB, raw_code: str) -> dict:
    if not promo_codes_enabled():
        raise ValueError("Промокоды отключены на этом сервере.")

    promo = lookup_promo(raw_code)
    if not promo:
        raise ValueError("Промокод не найден или недействителен.")

    if promo.action == "discount":
        return {
            "status": "discount",
            "code": promo.code,
            "discount_percent": promo.discount_percent,
            "message": promo.description,
            "description": promo.description,
        }

    tier = normalize_tier(promo.tier or "FREE")
    previous = normalize_tier(user.subscription_tier)

    if tier == "FREE" or not tier_requires_payment(tier):
        user.subscription_tier = tier
        db.commit()
        await suspend_polza_for_user(user, db)
        return {
            "status": "success",
            "action": "grant_tier",
            "tier": tier,
            "message": f"Тариф {tier} активирован.",
            "previous_tier": previous,
        }

    result = await activate_paid_tier(
        db, user, tier, grant_source="promo", previous_tier=previous
    )
    record_admin_subscription_invoice(db, user, tier)
    db.commit()
    db.refresh(user)

    quota_usd = result.get("monthly_quota_usd") or tier_monthly_cap(tier)
    rate = get_usd_rub_rate_sync()
    quota = result.get("quota") or get_quota_limit_info(db, user)

    logger.info("Promo %s → %s for %s", promo.code, tier, user.email)

    return {
        "status": "success",
        "action": "grant_tier",
        "tier": tier,
        "message": f"Промокод применён: тариф {tier} на 30 дней.",
        "previous_tier": previous,
        "monthly_quota_usd": quota_usd,
        "monthly_quota_rub": usd_to_rub(quota_usd, rate),
        "quota": quota,
        "billing_mode": "monthly_quota",
    }


def resolve_subscribe_discount(raw_code: str | None, amount_rub: float) -> tuple[float, PromoDef | None]:
    if not raw_code or not promo_codes_enabled():
        return amount_rub, None
    promo = lookup_promo(raw_code)
    if not promo or promo.action != "discount":
        return amount_rub, None
    from app.services.promo_codes import apply_discount

    return apply_discount(amount_rub, promo.discount_percent), promo
