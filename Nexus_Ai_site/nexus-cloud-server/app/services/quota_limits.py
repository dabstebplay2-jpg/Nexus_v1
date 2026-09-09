"""Месячный пул ИИ по оплаченному периоду подписки."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import DAILY_ABUSE_CAP_FRACTION, SUBSCRIPTION_PERIOD_DAYS, is_testing_mode
from app.database import TransactionDB, UserDB
from app.tiers import normalize_tier, tier_allows_ai, tier_monthly_cap
from app.time_utils import utc_now


class QuotaLimitExceeded(Exception):
    def __init__(self, info: dict):
        self.info = info
        cap = info.get("cap_usd", 0)
        spent = info.get("spent_usd", 0)
        super().__init__(
            f"Месячный лимит ИИ исчерпан (${spent:.2f} / ${cap:.2f}). "
            f"Продлите подписку или повысьте тариф."
        )


# Совместимость со старым именем
DailyLimitExceeded = QuotaLimitExceeded


def _naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def get_billing_period_start(user: UserDB) -> datetime | None:
    return _naive_utc(getattr(user, "subscription_period_start", None))


def get_billing_period_end(user: UserDB) -> datetime | None:
    return _naive_utc(getattr(user, "subscription_period_end", None))


def is_subscription_period_expired(user: UserDB) -> bool:
    """Период 30 дней истёк — пул подписки не тратится, top-up остаётся."""
    end = get_billing_period_end(user)
    if not end:
        return False
    return utc_now() > end


def start_subscription_period(user: UserDB, db: Session, *, days: int | None = None) -> None:
    """Начало нового оплаченного периода (сброс учёта AI_SPEND по дате)."""
    period_days = days if days is not None else SUBSCRIPTION_PERIOD_DAYS
    now = utc_now()
    user.subscription_period_start = now
    user.subscription_period_end = now + timedelta(days=period_days)
    db.commit()
    db.refresh(user)


def get_period_ai_spend(db: Session, user: UserDB) -> float:
    start = get_billing_period_start(user)
    if not start:
        return 0.0
    txs = (
        db.query(TransactionDB)
        .filter(
            TransactionDB.user_id == user.id,
            TransactionDB.tx_type == "AI_SPEND",
            TransactionDB.created_at >= start,
        )
        .all()
    )
    return round(sum(abs(float(tx.amount)) for tx in txs), 6)


def _utc_day_start_naive() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)


def get_today_ai_spend(db: Session, user_id: int) -> float:
    start = _utc_day_start_naive()
    txs = (
        db.query(TransactionDB)
        .filter(
            TransactionDB.user_id == user_id,
            TransactionDB.tx_type == "AI_SPEND",
            TransactionDB.created_at >= start,
        )
        .all()
    )
    return round(sum(abs(float(tx.amount)) for tx in txs), 6)


def get_quota_limit_info(db: Session, user: UserDB) -> dict:
    from app.services.invoice_pool import get_user_period_pool_usd
    from app.services.subscription_guard import (
        sync_billing_period_if_paid,
        user_has_paid_subscription,
    )
    from app.tiers import tier_requires_payment

    tier = normalize_tier(user.subscription_tier)

    if tier_requires_payment(tier) and user_has_paid_subscription(db, user):
        sync_billing_period_if_paid(db, user)
        db.refresh(user)

    # Базовый лимит подписки (каталог / счёт)
    sub_cap = get_user_period_pool_usd(db, user) or tier_monthly_cap(tier)
    if not tier_allows_ai(tier):
        sub_cap = 0.0

    period_end = get_billing_period_end(user)
    period_start = get_billing_period_start(user)
    period_expired = is_subscription_period_expired(user)

    # После окончания 30 дней пул подписки не тратится — только top-up
    spendable_sub_cap = 0.0 if period_expired else sub_cap

    user_balance = float(getattr(user, "balance", 0) or 0)
    cap = spendable_sub_cap + user_balance

    if spendable_sub_cap > 0 and not period_start:
        spent = 0.0
    else:
        spent = get_period_ai_spend(db, user) if spendable_sub_cap > 0 else 0.0

    sub_remaining = max(0.0, round(spendable_sub_cap - spent, 4))
    remaining = max(0.0, round(sub_remaining + user_balance, 4))

    pct = min(100.0, round((spent / spendable_sub_cap) * 100, 1)) if spendable_sub_cap > 0 else 0.0

    resets_label = period_end.strftime("%d.%m.%Y") if period_end else ""

    quota_enabled = cap > 0 and (
        user_balance > 0 or (bool(period_start) and not period_expired and sub_cap > 0)
    )

    return {
        "cap_usd": cap,
        "spent_usd": round(spent, 4),
        "remaining_usd": remaining,
        "used_percent": pct,
        "resets_at": resets_label,
        "period_start": period_start.isoformat() if period_start else None,
        "period_end": period_end.isoformat() if period_end else None,
        "period_expired": period_expired,
        "tier": tier,
        "quota_enabled": quota_enabled,
        "billing_mode": "monthly_quota",
        "user_balance_usd": user_balance,
        "subscription_cap_usd": round(sub_cap, 4),
        "subscription_remaining_usd": sub_remaining,
    }


# Алиасы для постепенной миграции API
get_daily_limit_info = get_quota_limit_info


def can_spend_quota(db: Session, user: UserDB, projected_cost: float = 0.0) -> tuple[bool, dict]:
    info = get_quota_limit_info(db, user)
    if info["cap_usd"] <= 0 or not info.get("quota_enabled"):
        return False, info
    if info["spent_usd"] + projected_cost > info["cap_usd"] + 1e-9:
        return False, info
    if DAILY_ABUSE_CAP_FRACTION > 0:
        daily_cap = info["cap_usd"] * DAILY_ABUSE_CAP_FRACTION
        today_spent = get_today_ai_spend(db, user.id)
        if today_spent + projected_cost > daily_cap + 1e-9:
            return False, {**info, "abuse_daily_cap_usd": round(daily_cap, 4)}
    return True, info


def assert_quota_budget(db: Session, user: UserDB, projected_cost: float = 0.0) -> dict:
    if is_testing_mode():
        return {
            "cap_usd": 999999.0,
            "spent_usd": 0.0,
            "remaining_usd": 999999.0,
            "used_percent": 0.0,
            "tier": normalize_tier(user.subscription_tier),
            "quota_enabled": True,
            "billing_mode": "monthly_quota",
            "testing_mode": True,
        }
    tier = normalize_tier(user.subscription_tier)
    has_balance = float(getattr(user, "balance", 0) or 0) > 0
    if not tier_allows_ai(tier) and not has_balance:
        raise QuotaLimitExceeded(
            {
                "cap_usd": 0,
                "spent_usd": 0,
                "remaining_usd": 0,
                "used_percent": 100,
                "tier": tier,
            }
        )
    info = get_quota_limit_info(db, user)
    if info.get("period_expired") and float(info.get("user_balance_usd") or 0) <= 0:
        raise QuotaLimitExceeded(
            {
                **info,
                "remaining_usd": 0,
                "used_percent": 100,
                "renewal_required": True,
            }
        )
    if info["cap_usd"] > 0 and not info.get("quota_enabled"):
        raise QuotaLimitExceeded(
            {
                **info,
                "remaining_usd": 0,
                "used_percent": 100,
            }
        )
    ok, info = can_spend_quota(db, user, projected_cost)
    if not ok:
        if info.get("period_expired") and float(info.get("user_balance_usd") or 0) <= 0:
            raise QuotaLimitExceeded(
                {
                    **info,
                    "remaining_usd": 0,
                    "used_percent": 100,
                    "renewal_required": True,
                }
            )
        raise QuotaLimitExceeded(info)
    return info


assert_daily_budget = assert_quota_budget
