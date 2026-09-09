"""Shared post-auth: subscription guard, Polza OAuth, JWT + refresh."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from app.config import is_testing_mode
from app.database import UserDB
from app.security import create_access_token
from app.services.polza import suspend_polza_for_user
from app.services.subscription_guard import enforce_paid_subscription
from app.services.testing_mode import ensure_testing_subscription
from app.tiers import normalize_tier, tier_requires_payment
from app.time_utils import utc_now

logger = logging.getLogger(__name__)


def _add_auth_method(user: UserDB, method: str) -> None:
    raw = (getattr(user, "auth_methods", None) or "").strip()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if method not in parts:
        parts.append(method)
    user.auth_methods = ",".join(parts)


async def issue_tokens_and_setup(db: Session, user: UserDB, *, mark_email_verified: bool = False) -> dict:
    """Enforce tier/Polza, rotate refresh token, return TokenResponse dict."""
    if mark_email_verified and not getattr(user, "email_verified_at", None):
        user.email_verified_at = utc_now()

    if is_testing_mode():
        await ensure_testing_subscription(db, user, tier="ULTRA")
    else:
        tier = normalize_tier(user.subscription_tier)
        if not await enforce_paid_subscription(db, user, trigger="auth_session"):
            tier = "FREE"
        db.refresh(user)
        if not tier_requires_payment(tier):
            await suspend_polza_for_user(user, db)

    refresh_token = "ref_" + str(uuid.uuid4())
    user.refresh_token = refresh_token
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": user.email})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


async def ensure_user_after_otp(db: Session, email: str) -> UserDB:
    """Find or create FREE user for email OTP / Google link by email."""
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if user:
        _add_auth_method(user, "email_otp")
        return user

    refresh_token = "ref_" + str(uuid.uuid4())
    user = UserDB(
        email=email,
        hashed_password="",
        subscription_tier="FREE",
        balance=0.0,
        refresh_token=refresh_token,
        email_verified_at=utc_now(),
        auth_methods="email_otp",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
