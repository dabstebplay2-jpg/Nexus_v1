"""Платная подписка: оплаченный счёт или выдача админом (см. record_admin_subscription_invoice)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import is_testing_mode
from app.database import InvoiceDB, UserDB
from app.services.polza import suspend_polza_for_user
from app.services.quota_limits import get_billing_period_start, start_subscription_period
from app.services.subscription_audit_log import (
    log_admin_invoice_recorded,
    log_enforce_skipped,
    log_tier_confirmed,
    log_tier_repaired,
    log_tier_revoked_by_server,
    subscription_state_snapshot,
)
from app.tiers import normalize_tier, tier_requires_payment


def admin_subscription_invoice_id(tier: str, user_id: int) -> str:
    return f"sub_{normalize_tier(tier)}_admin_{user_id}"


def record_admin_subscription_invoice(db: Session, user: UserDB, tier: str | None = None) -> str:
    """Оплаченный счёт-метка выдачи тарифа из админки (для enforce_paid_subscription)."""
    t = normalize_tier(tier or user.subscription_tier)
    if not tier_requires_payment(t):
        return ""
    inv_id = admin_subscription_invoice_id(t, user.id)
    inv = db.query(InvoiceDB).filter(InvoiceDB.id == inv_id).first()
    created = False
    if inv:
        if inv.status != "paid":
            inv.status = "paid"
    else:
        db.add(
            InvoiceDB(
                id=inv_id,
                user_id=user.id,
                amount_rub=0.0,
                amount=0.0,
                credits_usd=0.0,
                status="paid",
            )
        )
        created = True
    log_admin_invoice_recorded(user, t, inv_id, created=created)
    return inv_id


def revoke_admin_subscription_invoices(db: Session, user: UserDB) -> None:
    db.query(InvoiceDB).filter(
        InvoiceDB.user_id == user.id,
        InvoiceDB.id.like("%_admin_%"),
    ).delete(synchronize_session=False)


def user_has_paid_subscription(db: Session, user: UserDB, tier: str | None = None) -> bool:
    t = normalize_tier(tier or user.subscription_tier)
    if not tier_requires_payment(t):
        return False
    prefix = f"sub_{t}_"
    paid = (
        db.query(InvoiceDB)
        .filter(
            InvoiceDB.user_id == user.id,
            InvoiceDB.status == "paid",
            InvoiceDB.id.like(f"{prefix}%"),
        )
        .first()
    )
    return paid is not None


def repair_admin_subscription_entitlement(
    db: Session,
    user: UserDB,
    tier: str | None = None,
    *,
    trigger: str = "repair",
) -> bool:
    """
    Старые выдачи из админки: тариф + период без счёта — восстановить метку admin invoice.
    """
    t = normalize_tier(tier or user.subscription_tier)
    if not tier_requires_payment(t):
        return False
    if user_has_paid_subscription(db, user, t):
        return True
    if not get_billing_period_start(user):
        return False
    snap_before = subscription_state_snapshot(db, user, t)
    inv_id = record_admin_subscription_invoice(db, user, t)
    db.commit()
    ok = user_has_paid_subscription(db, user, t)
    if ok:
        log_tier_repaired(
            db,
            user=user,
            tier=t,
            trigger=trigger,
            invoice_id=inv_id,
            snap_before=snap_before,
        )
    return ok


def user_has_active_paid_subscription(db: Session, user: UserDB) -> bool:
    tier = normalize_tier(user.subscription_tier)
    if not tier_requires_payment(tier):
        return False
    if user_has_paid_subscription(db, user, tier):
        return True
    return repair_admin_subscription_entitlement(db, user, tier)


def sync_billing_period_if_paid(db: Session, user: UserDB) -> None:
    """Восстановить период для старых аккаунтов с оплаченным счётом без period_start."""
    if get_billing_period_start(user):
        return
    if not user_has_paid_subscription(db, user):
        return
    start_subscription_period(user, db)


async def enforce_paid_subscription(
    db: Session,
    user: UserDB,
    *,
    trigger: str = "unknown",
) -> bool:
    """
    Платный тариф без оплаты и без выдачи админом — откат на Free.
    Возвращает True, если у пользователя законное право на платный тариф.
    """
    if is_testing_mode():
        log_enforce_skipped(user, trigger, reason="NEXUS_TESTING_MODE — проверка отключена")
        return True
    tier = normalize_tier(user.subscription_tier)
    if not tier_requires_payment(tier):
        log_enforce_skipped(user, trigger, reason=f"тариф {tier} не требует оплаты")
        return True

    snap = subscription_state_snapshot(db, user, tier)
    has_invoice = user_has_paid_subscription(db, user, tier)
    has_period = bool(get_billing_period_start(user))

    if has_invoice:
        sync_billing_period_if_paid(db, user)
        reason = "есть оплаченный счёт"
        if snap["admin_grant_invoices"]:
            reason += f" (в т.ч. админ: {snap['admin_grant_invoices']})"
        elif snap["payment_invoices_for_tier"]:
            reason += f" (оплата: {snap['payment_invoices_for_tier']})"
        log_tier_confirmed(user=user, tier=tier, trigger=trigger, reason=reason, snap=snap)
        return True

    if has_period:
        if repair_admin_subscription_entitlement(db, user, tier, trigger=trigger):
            sync_billing_period_if_paid(db, user)
            log_tier_confirmed(
                user=user,
                tier=tier,
                trigger=trigger,
                reason="восстановлен admin-счёт по периоду подписки",
                snap=subscription_state_snapshot(db, user, tier),
            )
            return True

    reason_parts = [
        f"нет оплаченного счёта с префиксом sub_{tier}_",
    ]
    if not has_period:
        reason_parts.append("нет subscription_period_start (период не начат)")
    else:
        reason_parts.append(
            "период есть, но восстановление admin-счёта не помогло (проверьте БД/invoices)"
        )

    log_tier_revoked_by_server(
        user=user,
        tier_before=tier,
        trigger=trigger,
        reason="; ".join(reason_parts),
        snap_before=snap,
        checks={
            "оплаченный_счёт": has_invoice,
            "период_подписки": has_period,
            "admin_счета_в_снимке": bool(snap["admin_grant_invoices"]),
        },
    )

    user.subscription_tier = "FREE"
    user.subscription_period_start = None
    user.subscription_period_end = None
    revoke_admin_subscription_invoices(db, user)
    db.commit()
    await suspend_polza_for_user(user, db)
    return False
