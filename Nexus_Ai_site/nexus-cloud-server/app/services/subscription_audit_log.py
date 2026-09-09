"""Подробные логи выдачи тарифа (админ/оплата) и автоматического отката сервером."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.database import InvoiceDB, UserDB
from app.services.polza import user_has_polza_key
from app.services.quota_limits import get_billing_period_end, get_billing_period_start
from app.tiers import normalize_tier, tier_requires_payment

# Попадает в «Логи сервера» админки (handler на root)
logger = logging.getLogger("app.subscription")


def _fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%Y-%m-%d %H:%M:%S UTC")


def _polza_hint(user: UserDB) -> str:
    if not user_has_polza_key(user):
        return "ключ Polza: нет"
    kid = getattr(user, "polza_key_id", None) or "—"
    return f"ключ Polza: есть (key_id={kid})"


def subscription_state_snapshot(db: Session, user: UserDB, tier: str | None = None) -> dict[str, Any]:
    """Снимок состояния подписки для логов."""
    t = normalize_tier(tier or user.subscription_tier)
    paid_all = (
        db.query(InvoiceDB)
        .filter(InvoiceDB.user_id == user.id, InvoiceDB.status == "paid")
        .order_by(InvoiceDB.created_at.desc())
        .all()
    )
    paid_for_tier = [i for i in paid_all if i.id.startswith(f"sub_{t}_")]
    admin_invoices = [i.id for i in paid_all if "_admin_" in i.id]
    payment_invoices = [i.id for i in paid_for_tier if "_admin_" not in i.id]

    return {
        "user_id": user.id,
        "email": user.email,
        "tier_in_db": t,
        "balance_usd": round(float(user.balance or 0), 4),
        "period_start": _fmt_dt(get_billing_period_start(user)),
        "period_end": _fmt_dt(get_billing_period_end(user)),
        "paid_invoice_count": len(paid_all),
        "paid_invoices_all": [i.id for i in paid_all[:15]],
        "paid_invoices_for_tier": [i.id for i in paid_for_tier],
        "admin_grant_invoices": admin_invoices,
        "payment_invoices_for_tier": payment_invoices,
        "polza": _polza_hint(user),
        "tier_requires_payment": tier_requires_payment(t),
    }


def _snap_lines(snap: dict[str, Any]) -> str:
    return (
        f"user_id={snap['user_id']} email={snap['email']} "
        f"тариф_в_БД={snap['tier_in_db']} баланс=${snap['balance_usd']} | "
        f"период: {snap['period_start']} → {snap['period_end']} | "
        f"оплаченных_счетов={snap['paid_invoice_count']} "
        f"для_тарифа={snap['paid_invoices_for_tier'] or '[]'} "
        f"admin={snap['admin_grant_invoices'] or '[]'} "
        f"оплата={snap['payment_invoices_for_tier'] or '[]'} | "
        f"{snap['polza']}"
    )


def log_tier_granted(
    *,
    user: UserDB,
    tier: str,
    source: str,
    previous_tier: str | None = None,
    invoice_id: str | None = None,
    extra: str | None = None,
) -> None:
    prev = normalize_tier(previous_tier) if previous_tier else "—"
    inv = f" счёт-метка={invoice_id}" if invoice_id else ""
    tail = f" | {extra}" if extra else ""
    logger.info(
        "[ПОДПИСКА: ВЫДАЧА ТАРИФА] источник=%s %s → %s%s%s | период %s → %s | %s",
        source,
        prev,
        normalize_tier(tier),
        inv,
        tail,
        _fmt_dt(get_billing_period_start(user)),
        _fmt_dt(get_billing_period_end(user)),
        _polza_hint(user),
    )


def log_admin_invoice_recorded(user: UserDB, tier: str, invoice_id: str, *, created: bool) -> None:
    action = "создан" if created else "уже был, помечен paid"
    logger.info(
        "[ПОДПИСКА: СЧЁТ АДМИНА] %s | тариф=%s invoice_id=%s | %s",
        user.email,
        normalize_tier(tier),
        invoice_id,
        action,
    )


def log_tier_repaired(
    db: Session,
    *,
    user: UserDB,
    tier: str,
    trigger: str,
    invoice_id: str,
    snap_before: dict[str, Any],
) -> None:
    snap_after = subscription_state_snapshot(db, user, tier)
    logger.info(
        "[ПОДПИСКА: ВОССТАНОВЛЕНИЕ] триггер=%s | %s | admin-счёт %s | ДО: %s | ПОСЛЕ: %s",
        trigger,
        user.email,
        invoice_id,
        _snap_lines(snap_before),
        _snap_lines(snap_after),
    )


def log_tier_confirmed(
    *,
    user: UserDB,
    tier: str,
    trigger: str,
    reason: str,
    snap: dict[str, Any] | None = None,
) -> None:
    detail = _snap_lines(snap) if snap else _polza_hint(user)
    logger.info(
        "[ПОДПИСКА: ПОДТВЕРЖДЕНА] триггер=%s | %s | тариф=%s оставлен | причина: %s | %s",
        trigger,
        user.email,
        normalize_tier(tier),
        reason,
        detail,
    )


def log_tier_revoked_by_server(
    *,
    user: UserDB,
    tier_before: str,
    trigger: str,
    reason: str,
    snap_before: dict[str, Any],
    checks: dict[str, bool],
) -> None:
    checks_txt = ", ".join(f"{k}={'да' if v else 'нет'}" for k, v in checks.items())
    logger.warning(
        "[ПОДПИСКА: ОТКАТ СЕРВЕРОМ] триггер=%s | %s | %s → FREE | причина: %s | проверки: %s",
        trigger,
        user.email,
        normalize_tier(tier_before),
        reason,
        checks_txt,
    )
    logger.warning("[ПОДПИСКА: ОТКАТ] состояние до отката: %s", _snap_lines(snap_before))
    logger.warning(
        "[ПОДПИСКА: ОТКАТ] действия: тариф=FREE, период сброшен, admin-счета удалены, Polza suspend"
    )


def log_tier_revoked_by_admin(user: UserDB, *, previous_tier: str) -> None:
    logger.info(
        "[ПОДПИСКА: СБРОС АДМИНОМ] %s | %s → FREE | баланс обнулён, ключ Polza отключён",
        user.email,
        normalize_tier(previous_tier),
    )


def log_enforce_skipped(user: UserDB, trigger: str, *, reason: str) -> None:
    logger.debug(
        "[ПОДПИСКА: проверка пропущена] триггер=%s | %s | %s",
        trigger,
        user.email,
        reason,
    )
