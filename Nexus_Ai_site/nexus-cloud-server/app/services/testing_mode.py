"""Режим тестирования: ULTRA по умолчанию, все модели, без лимитов квоты."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.config import is_testing_mode
from app.database import UserDB
from app.services.subscription_activate import activate_paid_tier
from app.tiers import normalize_tier, tier_requires_payment

logger = logging.getLogger(__name__)

DEFAULT_TESTING_TIER = "ULTRA"


async def ensure_testing_subscription(db: Session, user: UserDB, *, tier: str | None = None) -> str:
    """
    В тестовом режиме гарантирует платный тариф с ключом Polza и периодом.
    По умолчанию — ULTRA.
    """
    if not is_testing_mode():
        return normalize_tier(user.subscription_tier)

    target = normalize_tier(tier or user.subscription_tier or DEFAULT_TESTING_TIER)
    if target == "FREE":
        user.subscription_tier = "FREE"
        db.commit()
        return "FREE"

    current = normalize_tier(user.subscription_tier)
    if current != target or not tier_requires_payment(current):
        await activate_paid_tier(db, user, target, grant_source="admin")
        logger.info("Testing mode: %s → tier %s", user.email, target)
    return normalize_tier(user.subscription_tier)
