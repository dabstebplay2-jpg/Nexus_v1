"""Пул ИИ (USD) из суммы оплаченного счёта подписки."""

from __future__ import annotations

from app.config import TIER_POOL_FRACTION
from app.database import InvoiceDB
from app.services.fx_rates import get_usd_rub_rate_sync, rub_to_usd
from app.tiers import normalize_tier, tier_monthly_cap


def is_subscription_pool_invoice(invoice: InvoiceDB) -> bool:
    """Счёт подписки (не пополнение баланса Pay-As-You-Go)."""
    inv_id = (getattr(invoice, "id", None) or "").strip()
    if inv_id.startswith("topup_"):
        return False
    tier = normalize_tier(getattr(invoice, "subscription_tier", None) or "")
    if tier == "TOPUP":
        return False
    return True


def _tier_from_invoice(invoice: InvoiceDB) -> str:
    stored = (getattr(invoice, "subscription_tier", None) or "").strip()
    if stored:
        return normalize_tier(stored)
    parts = (invoice.id or "").split("_")
    if len(parts) >= 3 and parts[0] == "sub":
        return normalize_tier(parts[1])
    return "FREE"


def invoice_pool_usd(invoice: InvoiceDB, *, rate: float | None = None) -> float:
    """Пул ИИ в USD: ~92% от фактической суммы счёта в ₽ или каталог тарифа."""
    stored = float(getattr(invoice, "credits_usd", 0) or 0)
    if stored > 0:
        return round(stored, 4)

    amount_rub = float(getattr(invoice, "amount_rub", 0) or 0)
    if amount_rub > 0:
        r = rate if rate is not None else get_usd_rub_rate_sync()
        pool = rub_to_usd(amount_rub, r) * TIER_POOL_FRACTION
        return round(max(0.01, pool), 4)

    return tier_monthly_cap(_tier_from_invoice(invoice))


def persist_invoice_pool_usd(invoice: InvoiceDB, *, rate: float | None = None) -> float:
    """Записать вычисленный пул в invoice.credits_usd (если ещё не задан)."""
    pool = invoice_pool_usd(invoice, rate=rate)
    if float(getattr(invoice, "credits_usd", 0) or 0) <= 0:
        invoice.credits_usd = pool
    return pool


def get_user_period_pool_usd(db, user) -> float | None:
    """Пул из последнего оплаченного счёта текущего периода (для промо и точной суммы)."""
    from app.database import InvoiceDB
    from app.services.quota_limits import get_billing_period_start
    from app.tiers import normalize_tier, tier_requires_payment

    tier = normalize_tier(user.subscription_tier)
    if not tier_requires_payment(tier):
        return None
    period_start = get_billing_period_start(user)
    if not period_start:
        return None
    paid_in_period = (
        db.query(InvoiceDB)
        .filter(
            InvoiceDB.user_id == user.id,
            InvoiceDB.status == "paid",
            InvoiceDB.created_at >= period_start,
        )
        .order_by(InvoiceDB.created_at.desc())
        .all()
    )
    inv = next((i for i in paid_in_period if is_subscription_pool_invoice(i)), None)
    if not inv:
        return None
    pool = float(getattr(inv, "credits_usd", 0) or 0)
    if pool > 0:
        return round(pool, 4)
    amount_rub = float(getattr(inv, "amount_rub", 0) or 0)
    if amount_rub > 0:
        return invoice_pool_usd(inv)
    return None
