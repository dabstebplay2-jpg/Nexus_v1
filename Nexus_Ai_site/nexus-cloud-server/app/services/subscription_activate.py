"""Активация платной подписки (оплата / admin grant)."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.database import InvoiceDB, TransactionDB, UserDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.openrouter_provision import delete_openrouter_key_for_user
from app.services.polza import (
    provision_polza_for_user,
    sync_polza_key_limit_after_payment,
    user_has_polza_key,
)
from app.services.quota_limits import get_quota_limit_info, start_subscription_period
from app.services.subscription_audit_log import log_tier_granted, subscription_state_snapshot
from app.services.subscription_guard import (
    admin_subscription_invoice_id,
    record_admin_subscription_invoice,
)
from app.tiers import (
    normalize_tier,
    tier_monthly_cap,
    tier_requires_payment,
    tier_uses_openrouter_free,
)

logger = logging.getLogger("app.subscription")


def _subscription_tx_description(
    *,
    tier: str,
    source: str,
    quota_usd: float,
    invoice: InvoiceDB | None = None,
) -> str:
    if source == "payment" and invoice is not None:
        amount_rub = float(getattr(invoice, "amount_rub", 0) or 0)
        pool_rub = usd_to_rub(quota_usd, get_usd_rub_rate_sync())
        if amount_rub > 0:
            return (
                f"Оплата {amount_rub:,.0f} ₽ → пул ИИ ~{pool_rub:,.0f} ₽ "
                f"(${quota_usd:.2f}) на лимит Polza, тариф {tier}"
            ).replace(",", " ")
    return f"Подписка {tier} — пул {quota_usd:.2f} USD/мес"


async def activate_paid_tier(
    db: Session,
    user: UserDB,
    tier: str,
    *,
    grant_source: str | None = None,
    previous_tier: str | None = None,
    invoice: InvoiceDB | None = None,
    quota_usd: float | None = None,
) -> dict:
    tier = normalize_tier(tier)
    prev = normalize_tier(previous_tier or user.subscription_tier)
    source = grant_source or "payment"

    if tier_requires_payment(tier) and tier_uses_openrouter_free(prev):
        await delete_openrouter_key_for_user(user, db)

    if not tier_requires_payment(tier):
        user.subscription_tier = tier
        db.commit()
        log_tier_granted(
            user=user,
            tier=tier,
            source=source,
            previous_tier=prev,
            extra="бесплатный/низкий тариф, период не требуется",
        )
        return {"tier": tier, "immediate": True}

    user.subscription_tier = tier
    start_subscription_period(user, db)
    invoice_id: str | None = None
    if grant_source == "admin":
        invoice_id = record_admin_subscription_invoice(db, user, tier)

    pool = float(quota_usd if quota_usd is not None else tier_monthly_cap(tier))
    db.add(
        TransactionDB(
            user_id=user.id,
            amount=0,
            tx_type="SUB_RENEW",
            description=_subscription_tx_description(
                tier=tier,
                source=source,
                quota_usd=pool,
                invoice=invoice,
            ),
        )
    )
    db.commit()
    db.refresh(user)

    snap = subscription_state_snapshot(db, user, tier)
    log_tier_granted(
        user=user,
        tier=tier,
        source=source,
        previous_tier=prev,
        invoice_id=invoice_id
        or (invoice.id if invoice else None)
        or (admin_subscription_invoice_id(tier, user.id) if grant_source == "admin" else None),
        extra=_snap_lines_short(snap),
    )

    try:
        pool_rub = usd_to_rub(pool, get_usd_rub_rate_sync())
        if user_has_polza_key(user):
            ok = await sync_polza_key_limit_after_payment(user, pool_rub=pool_rub)
            db.commit()
            logger.info(
                "[ПОДПИСКА: ВЫДАЧА] Polza лимит для %s (тариф %s, пул %.0f ₽) ok=%s",
                user.email,
                tier,
                pool_rub,
                ok,
            )
        else:
            ok = await provision_polza_for_user(user, db, pool_rub=pool_rub, force=False)
            db.commit()
            logger.info(
                "[ПОДПИСКА: ВЫДАЧА] автовыдача Polza для %s (тариф %s) ok=%s",
                user.email,
                tier,
                ok,
            )
    except Exception as exc:
        logger.error(
            "[ПОДПИСКА: ВЫДАЧА] Polza ошибка для %s (тариф %s): %s",
            user.email,
            tier,
            exc,
        )

    quota = get_quota_limit_info(db, user)
    return {
        "tier": tier,
        "monthly_quota_usd": pool,
        "quota": quota,
    }


def _snap_lines_short(snap: dict) -> str:
    return (
        f"счета={snap['paid_invoices_for_tier'] or 'нет'} "
        f"период {snap['period_start']}→{snap['period_end']}"
    )
