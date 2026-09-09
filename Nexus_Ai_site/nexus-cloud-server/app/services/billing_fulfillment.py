"""Активация подписки после оплаты счёта."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.orm import Session

from app.database import InvoiceDB, TransactionDB, UserDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.invoice_pool import invoice_pool_usd, persist_invoice_pool_usd
from app.services.platform_funding import record_payment_obligation
from app.services.polza import (
    provision_polza_for_user,
    sync_polza_key_limit_after_payment,
    user_has_polza_key,
)
from app.services.quota_limits import get_quota_limit_info
from app.services.subscription_activate import activate_paid_tier
from app.tiers import normalize_tier, tier_requires_payment

logger = logging.getLogger(__name__)


def invoice_tier_from_id(invoice_id: str) -> str:
    parts = (invoice_id or "").split("_")
    if len(parts) >= 3 and parts[0] == "sub":
        return normalize_tier(parts[1])
    return "FREE"


def resolve_invoice_tier(invoice: InvoiceDB) -> str:
    stored = (getattr(invoice, "subscription_tier", None) or "").strip()
    if stored:
        return normalize_tier(stored)
    return invoice_tier_from_id(invoice.id)


async def _sync_paid_invoice_polza(
    db: Session,
    user: UserDB,
    invoice: InvoiceDB,
    pool_usd: float,
    *,
    trigger: str,
) -> bool:
    """Идемпотентно: ключ Polza + месячный лимит = пул из счёта (₽)."""
    amount_rub = float(getattr(invoice, "amount_rub", 0) or 0)
    pool_rub = usd_to_rub(pool_usd, get_usd_rub_rate_sync())
    ok = await provision_polza_for_user(user, db, pool_rub=pool_rub, force=False)
    db.refresh(user)
    if not ok:
        logger.warning(
            "[ПОДПИСКА: ПУЛ] автовыдача Polza не удалась | user=%s | invoice=%s | trigger=%s",
            user.id,
            invoice.id,
            trigger,
        )
        return False
    ok = await sync_polza_key_limit_after_payment(user, pool_rub=pool_rub)
    db.commit()
    logger.info(
        "[ПОДПИСКА: ПУЛ] %s RUB → %.0f ₽ limit Polza | user=%s | invoice=%s | trigger=%s | ok=%s",
        f"{amount_rub:.0f}" if amount_rub else "?",
        pool_rub,
        user.id,
        invoice.id,
        trigger,
        ok,
    )
    return ok


async def _sync_paid_invoice_polza_with_retry(
    db: Session,
    user: UserDB,
    invoice: InvoiceDB,
    pool_usd: float,
    *,
    trigger: str,
    max_attempts: int = 3,
) -> bool:
    """Повторная попытка выдачи ключа Polza после оплаты."""
    for attempt in range(max_attempts):
        ok = await _sync_paid_invoice_polza(db, user, invoice, pool_usd, trigger=trigger)
        db.refresh(user)
        if ok and user_has_polza_key(user):
            return True
        if attempt < max_attempts - 1:
            await asyncio.sleep(1.5)
    return user_has_polza_key(user)


async def _repair_paid_invoice_entitlements(
    db: Session,
    user: UserDB,
    invoice: InvoiceDB,
    *,
    trigger: str,
) -> str:
    """Синхронизировать тариф и лимит Polza со счётом (идемпотентно)."""
    tier = resolve_invoice_tier(invoice)
    if not tier_requires_payment(tier):
        return normalize_tier(user.subscription_tier)

    rate = get_usd_rub_rate_sync()
    pool_usd = persist_invoice_pool_usd(invoice, rate=rate)
    db.commit()

    user_tier = normalize_tier(user.subscription_tier)
    if user_tier != tier:
        logger.info(
            "[ПОДПИСКА: ВОССТАНОВЛЕНИЕ] %s | %s → %s | invoice=%s | trigger=%s",
            user.email,
            user_tier,
            tier,
            invoice.id,
            trigger,
        )
        await activate_paid_tier(
            db,
            user,
            tier,
            grant_source="payment",
            previous_tier=user_tier,
            invoice=invoice,
            quota_usd=pool_usd,
        )
        db.refresh(user)
        return tier

    ok = await _sync_paid_invoice_polza_with_retry(db, user, invoice, pool_usd, trigger=trigger)
    if ok:
        logger.info(
            "[ПОДПИСКА: ВОССТАНОВЛЕНИЕ] Polza лимит синхронизирован | %s | тариф %s | trigger=%s",
            user.email,
            user_tier,
            trigger,
        )
    elif not user_has_polza_key(user):
        logger.warning(
            "[ПОДПИСКА: ВОССТАНОВЛЕНИЕ] ключ Polza не выдан | %s | тариф %s | trigger=%s",
            user.email,
            user_tier,
            trigger,
        )
    return user_tier


def _polza_status_fields(user: UserDB | None) -> dict[str, object]:
    ready = user_has_polza_key(user) if user else False
    out: dict[str, object] = {"polza_ready": ready}
    if user and not ready:
        out["polza_warning"] = (
            "Тариф активирован, но ключ ИИ ещё не готов. "
            "Подождите минуту или нажмите «Починить ключ ИИ» в настройках."
        )
    return out


def _fulfillment_response(
    *,
    tier: str,
    user: UserDB | None,
    pool_usd: float,
    quota: dict | None = None,
    already_paid: bool = False,
) -> dict:
    rate = get_usd_rub_rate_sync()
    pool_rub = usd_to_rub(pool_usd, rate)
    out = {
        "status": "paid",
        "tier": tier,
        "billing_mode": "monthly_quota",
        "monthly_quota_usd": pool_usd,
        "monthly_quota_rub": pool_rub,
        "daily_quota_usd": pool_usd,
        "daily_quota_rub": pool_rub,
        "pool_usd": pool_usd,
        "pool_rub": pool_rub,
        "balance_usd": round(float(user.balance or 0), 4) if user else 0,
        "balance_rub": usd_to_rub(float(user.balance or 0), rate) if user else 0,
    }
    if already_paid:
        out["already_paid"] = True
    if quota:
        out["quota"] = quota
    out.update(_polza_status_fields(user))
    return out


async def fulfill_topup_invoice(
    db: Session,
    invoice: InvoiceDB,
    *,
    trigger: str = "payment",
) -> dict:
    """Пометить счёт пополнения оплаченным и зачислить средства на баланс пользователя (идемпотентно)."""
    rate = get_usd_rub_rate_sync()

    user = db.query(UserDB).filter(UserDB.id == invoice.user_id).first()
    if not user:
        raise ValueError("Пользователь счёта не найден")

    if invoice.status == "paid":
        return {
            "status": "paid",
            "balance_usd": round(float(user.balance or 0), 4),
            "balance_rub": usd_to_rub(float(user.balance or 0), rate),
            "pool_usd": invoice.credits_usd,
            "pool_rub": usd_to_rub(invoice.credits_usd, rate),
        }

    pool_usd = persist_invoice_pool_usd(invoice, rate=rate)
    invoice.status = "paid"

    old_balance = float(user.balance or 0)
    user.balance = round(old_balance + pool_usd, 6)

    db.add(
        TransactionDB(
            user_id=user.id,
            amount=pool_usd,
            tx_type="TOPUP",
            description=f"Пополнение баланса: +${pool_usd:.2f} (через счёт {invoice.id})",
        )
    )
    db.commit()

    logger.info(
        "[ПОПОЛНЕНИЕ: ОПЛАТА] %s → paid | %s | баланс: $%.2f → $%.2f | pool=$%.2f | trigger=%s",
        invoice.id,
        user.email,
        old_balance,
        user.balance,
        pool_usd,
        trigger,
    )

    pool_rub = usd_to_rub(pool_usd, rate)
    if user_has_polza_key(user):
        await sync_polza_key_limit_after_payment(user, pool_rub=pool_rub)
    db.commit()
    record_payment_obligation(db, invoice=invoice, pool_usd=pool_usd, user_id=user.id)

    out = {
        "status": "paid",
        "balance_usd": round(float(user.balance or 0), 4),
        "balance_rub": usd_to_rub(float(user.balance or 0), rate),
        "pool_usd": pool_usd,
        "pool_rub": usd_to_rub(pool_usd, rate),
    }
    out.update(_polza_status_fields(user))
    return out


async def fulfill_subscription_invoice(
    db: Session,
    invoice: InvoiceDB,
    *,
    trigger: str = "payment",
) -> dict:
    """Пометить счёт оплаченным и активировать тариф (идемпотентно)."""
    if invoice.id and invoice.id.startswith("topup_"):
        return await fulfill_topup_invoice(db, invoice, trigger=trigger)

    rate = get_usd_rub_rate_sync()

    if invoice.status == "paid":
        user = db.query(UserDB).filter(UserDB.id == invoice.user_id).first()
        tier = resolve_invoice_tier(invoice)
        pool_usd = invoice_pool_usd(invoice, rate=rate)
        if user:
            tier = await _repair_paid_invoice_entitlements(db, user, invoice, trigger=trigger)
            pool_usd = invoice_pool_usd(invoice, rate=rate)
            quota = get_quota_limit_info(db, user)
        else:
            quota = None
        return _fulfillment_response(
            tier=tier,
            user=user,
            pool_usd=pool_usd,
            quota=quota,
            already_paid=True,
        )

    user = db.query(UserDB).filter(UserDB.id == invoice.user_id).first()
    if not user:
        raise ValueError("Пользователь счёта не найден")

    tier = resolve_invoice_tier(invoice)
    if not tier_requires_payment(tier):
        raise ValueError("Счёт не для платного тарифа")

    previous = normalize_tier(user.subscription_tier)
    pool_usd = persist_invoice_pool_usd(invoice, rate=rate)
    invoice.status = "paid"
    db.commit()

    logger.info(
        "[ПОДПИСКА: ОПЛАТА] %s → paid | %s | %s → %s | pool=$%.2f | trigger=%s",
        invoice.id,
        user.email,
        previous,
        tier,
        pool_usd,
        trigger,
    )

    result = await activate_paid_tier(
        db,
        user,
        tier,
        grant_source="payment",
        previous_tier=previous,
        invoice=invoice,
        quota_usd=pool_usd,
    )
    await _sync_paid_invoice_polza_with_retry(db, user, invoice, pool_usd, trigger=trigger)
    db.refresh(user)
    record_payment_obligation(db, invoice=invoice, pool_usd=pool_usd, user_id=user.id)
    quota = result.get("quota") or get_quota_limit_info(db, user)
    pool_usd = float(result.get("monthly_quota_usd") or pool_usd)

    response = _fulfillment_response(tier=tier, user=user, pool_usd=pool_usd, quota=quota)
    if not response.get("polza_ready"):
        await _sync_paid_invoice_polza_with_retry(
            db, user, invoice, pool_usd, trigger=f"{trigger}_retry"
        )
        db.refresh(user)
        response.update(_polza_status_fields(user))
    if not response.get("polza_ready"):
        logger.warning(
            "[ПОДПИСКА: ОПЛАТА] тариф %s активен, ключ Polza не готов | user=%s | invoice=%s",
            tier,
            user.id,
            invoice.id,
        )
    return response
