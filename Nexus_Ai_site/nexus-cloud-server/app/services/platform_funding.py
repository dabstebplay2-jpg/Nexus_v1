"""Учёт баланса org Polza.ai и обязательств после оплат подписок."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.config import (
    POLZA_BALANCE_ALERT_COOLDOWN_HOURS,
    POLZA_BALANCE_BUFFER,
    TIER_POOL_FRACTION,
)
from app.database import InvoiceDB, PlatformFundingObligationDB, PlatformSettingsDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.time_utils import utc_now

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return utc_now()


def _month_start_utc() -> datetime:
    now = _utc_now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_platform_settings(db: Session) -> PlatformSettingsDB:
    row = db.query(PlatformSettingsDB).filter(PlatformSettingsDB.id == 1).first()
    if row is None:
        row = PlatformSettingsDB(id=1, polza_org_balance_rub=0.0)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def set_polza_org_balance_rub(db: Session, balance_rub: float) -> PlatformSettingsDB:
    row = get_platform_settings(db)
    row.polza_org_balance_rub = max(0.0, round(float(balance_rub), 2))
    row.updated_at = _utc_now()
    db.commit()
    db.refresh(row)
    return row


async def refresh_polza_org_balance(db: Session) -> float:
    from app.services.polza import PolzaService
    from app.services.polza_mcp import mcp_get_org_balance_rub

    balance: float | None = None
    try:
        balance = await mcp_get_org_balance_rub()
    except Exception:
        balance = None
    if balance is None:
        try:
            check = await PolzaService().verify_backend_key()
            if check.get("ok"):
                balance = float(check.get("balance_rub") or 0)
        except Exception:
            balance = None
    if balance is not None:
        set_polza_org_balance_rub(db, balance)
        return balance
    row = get_platform_settings(db)
    return float(row.polza_org_balance_rub or 0)


def record_payment_obligation(
    db: Session,
    *,
    invoice: InvoiceDB,
    pool_usd: float,
    user_id: int,
) -> PlatformFundingObligationDB | None:
    """Идемпотентно: зафиксировать обязательство после оплаты подписки."""
    existing = (
        db.query(PlatformFundingObligationDB)
        .filter(PlatformFundingObligationDB.invoice_id == invoice.id)
        .first()
    )
    if existing:
        return existing
    amount_rub = float(getattr(invoice, "amount_rub", 0) or 0)
    pool = max(0.0, round(float(pool_usd), 4))
    row = PlatformFundingObligationDB(
        invoice_id=invoice.id,
        user_id=int(user_id),
        amount_rub=amount_rub,
        pool_usd=pool,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "[FUNDING: ОБЯЗАТЕЛЬСТВО] invoice=%s pool=$%.2f amount_rub=%.0f user=%s",
        invoice.id,
        pool,
        amount_rub,
        user_id,
    )
    return row


def sum_obligations_usd(db: Session) -> float:
    rows = db.query(PlatformFundingObligationDB).all()
    return round(sum(float(r.pool_usd or 0) for r in rows), 4)


def sum_received_rub_month(db: Session) -> float:
    start = _month_start_utc()
    rows = (
        db.query(InvoiceDB)
        .filter(
            InvoiceDB.status == "paid",
            InvoiceDB.id.like("sub_%"),
            InvoiceDB.created_at >= start,
        )
        .all()
    )
    return round(sum(float(r.amount_rub or 0) for r in rows), 2)


def compute_funding_metrics(db: Session) -> dict[str, Any]:
    from app.services.routerai_pool_monitor import aggregate_user_pool_usd

    settings = get_platform_settings(db)
    pools = aggregate_user_pool_usd(db)
    reserved_usd = float(pools.get("total_pool_usd") or 0)
    rate = get_usd_rub_rate_sync()
    required_rub = float(pools.get("total_pool_rub") or usd_to_rub(reserved_usd, rate))
    org_balance_rub = float(settings.polza_org_balance_rub or 0)
    required_with_buffer = round(required_rub * POLZA_BALANCE_BUFFER, 2)
    shortfall_rub = round(max(0.0, required_with_buffer - org_balance_rub), 2)
    return {
        "polza_org_balance_rub": round(org_balance_rub, 2),
        "reserved_pool_usd": reserved_usd,
        "reserved_pool_rub": pools.get("total_pool_rub") or usd_to_rub(reserved_usd, rate),
        "obligations_recorded_usd": sum_obligations_usd(db),
        "received_rub_month": sum_received_rub_month(db),
        "active_subscribers": pools.get("active_subscribers", 0),
        "tier_pool_fraction": TIER_POOL_FRACTION,
        "required_balance_rub": required_with_buffer,
        "recommended_topup_rub": shortfall_rub,
        "funding_ok": shortfall_rub <= 0.01,
        "usd_rub_rate": rate,
        "last_funding_alert_at": (
            settings.last_funding_alert_at.isoformat() if settings.last_funding_alert_at else None
        ),
        # legacy aliases for admin UI transition
        "routerai_deposit_rub": round(org_balance_rub, 2),
        "required_deposit_rub": required_with_buffer,
    }


def should_send_funding_alert(db: Session) -> tuple[bool, dict[str, Any]]:
    metrics = compute_funding_metrics(db)
    if metrics["funding_ok"]:
        return False, metrics
    settings = get_platform_settings(db)
    if settings.last_funding_alert_at:
        cooldown = timedelta(hours=max(0.5, POLZA_BALANCE_ALERT_COOLDOWN_HOURS))
        if _utc_now() - settings.last_funding_alert_at < cooldown:
            return False, {**metrics, "alert_suppressed": True}
    return True, metrics


def mark_funding_alert_sent(db: Session) -> None:
    row = get_platform_settings(db)
    row.last_funding_alert_at = _utc_now()
    db.commit()
