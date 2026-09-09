"""Агрегаты для дашборда админки."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import InvoiceDB, TransactionDB, UserDB
from app.tiers import TIER_ORDER, normalize_tier, tier_price
from app.time_utils import utc_now


def _day_start(days_ago: int) -> datetime:
    now = utc_now()
    return (now - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)


def analytics_summary(db: Session) -> dict:
    total = db.query(func.count(UserDB.id)).scalar() or 0
    since_7 = _day_start(7)
    since_30 = _day_start(30)
    new_7d = (
        db.query(func.count(UserDB.id)).filter(UserDB.created_at >= since_7).scalar() or 0
    )
    new_30d = (
        db.query(func.count(UserDB.id)).filter(UserDB.created_at >= since_30).scalar() or 0
    )
    paid = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.subscription_tier != "FREE")
        .scalar()
        or 0
    )
    by_tier = (
        db.query(UserDB.subscription_tier, func.count(UserDB.id))
        .group_by(UserDB.subscription_tier)
        .all()
    )
    mrr_usd = 0.0
    for tier_raw, count in by_tier:
        tier = normalize_tier(tier_raw or "FREE")
        if tier != "FREE":
            mrr_usd += tier_price(tier) * int(count)

    tx_count = db.query(func.count(TransactionDB.id)).scalar() or 0
    tx_volume = db.query(func.coalesce(func.sum(TransactionDB.amount), 0.0)).scalar() or 0.0
    inv_pending = (
        db.query(func.count(InvoiceDB.id)).filter(InvoiceDB.status == "pending").scalar() or 0
    )
    tg_linked = (
        db.query(func.count(UserDB.id)).filter(UserDB.telegram_id.isnot(None)).scalar() or 0
    )
    with_openrouter = (
        db.query(func.count(UserDB.id))
        .filter(UserDB.openrouter_api_key_encrypted.isnot(None))
        .scalar()
        or 0
    )

    return {
        "users_total": int(total),
        "users_new_7d": int(new_7d),
        "users_new_30d": int(new_30d),
        "users_paid": int(paid),
        "users_telegram_linked": int(tg_linked),
        "users_with_openrouter_key": int(with_openrouter),
        "mrr_usd_estimate": round(float(mrr_usd), 2),
        "transactions_total": int(tx_count),
        "transactions_volume_usd": round(float(tx_volume), 4),
        "invoices_pending": int(inv_pending),
    }


def analytics_registrations(db: Session, *, days: int = 30) -> list[dict]:
    since = _day_start(days)
    rows = (
        db.query(func.date(UserDB.created_at).label("day"), func.count(UserDB.id))
        .filter(UserDB.created_at >= since)
        .group_by(func.date(UserDB.created_at))
        .order_by(func.date(UserDB.created_at))
        .all()
    )
    return [{"date": str(day), "count": int(count)} for day, count in rows]


def analytics_tiers(db: Session) -> list[dict]:
    rows = (
        db.query(UserDB.subscription_tier, func.count(UserDB.id))
        .group_by(UserDB.subscription_tier)
        .all()
    )
    counts = {normalize_tier(t or "FREE"): int(c) for t, c in rows}
    return [
        {"tier": tier, "count": counts.get(tier, 0)}
        for tier in TIER_ORDER
        if counts.get(tier, 0) > 0
    ]


def analytics_revenue(db: Session, *, days: int = 30) -> list[dict]:
    since = _day_start(days)
    tx_rows = (
        db.query(func.date(TransactionDB.created_at).label("day"), func.sum(TransactionDB.amount))
        .filter(TransactionDB.created_at >= since)
        .filter(TransactionDB.amount > 0)
        .group_by(func.date(TransactionDB.created_at))
        .all()
    )
    inv_rows = (
        db.query(func.date(InvoiceDB.created_at).label("day"), func.sum(InvoiceDB.amount_rub))
        .filter(InvoiceDB.created_at >= since)
        .filter(InvoiceDB.status == "paid")
        .group_by(func.date(InvoiceDB.created_at))
        .all()
    )
    by_day: dict[str, dict] = {}
    for day, amount in tx_rows:
        key = str(day)
        by_day.setdefault(key, {"date": key, "tx_usd": 0.0, "invoice_rub": 0.0})
        by_day[key]["tx_usd"] = round(float(amount or 0), 4)
    for day, amount in inv_rows:
        key = str(day)
        by_day.setdefault(key, {"date": key, "tx_usd": 0.0, "invoice_rub": 0.0})
        by_day[key]["invoice_rub"] = round(float(amount or 0), 2)
    return [by_day[k] for k in sorted(by_day.keys())]
