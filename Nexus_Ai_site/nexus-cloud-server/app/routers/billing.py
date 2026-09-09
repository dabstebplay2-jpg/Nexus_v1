import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import (
    NEXUS_BILLING_TEST_MODE,
    TIER_POOL_FRACTION,
    is_testing_mode,
    yookassa_enabled,
)
from app.database import InvoiceDB, TransactionDB, UserDB, get_db
from app.schemas import PromoRedeemRequest, SubscribeRequest, TopupRequest
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.billing_fulfillment import (
    fulfill_subscription_invoice,
    fulfill_topup_invoice,
    invoice_tier_from_id,
)
from app.services.fx_rates import (
    fx_rate_metadata,
    get_usd_rub_rate_sync,
    refresh_usd_rub_rate,
    rub_to_usd,
    usd_to_rub,
)
from app.services.invoice_pool import invoice_pool_usd
from app.services.models_registry import tier_rank
from app.services.polza import suspend_polza_for_user
from app.services.promo_codes import promo_codes_enabled, public_promo_hints
from app.services.promo_redeem import redeem_promo_code, resolve_subscribe_discount
from app.services.usage_stats import aggregate_usage_stats
from app.services.yookassa import (
    YooKassaError,
    create_payment,
    get_payment,
    payment_is_succeeded,
    yookassa_configured,
)
from app.tiers import (
    normalize_tier,
    public_tiers_list,
    tier_monthly_cap,
    tier_price,
    tier_requires_payment,
)

router = APIRouter(prefix="/v1/billing", tags=["billing"])
logger = logging.getLogger("app.subscription")


def _invoice_row(
    *,
    invoice_id: str,
    user_id: int,
    amount_rub: float,
    credits_usd: float,
    tier: str,
    status: str = "pending",
) -> InvoiceDB:
    rub = round(float(amount_rub), 2)
    normalized_tier = "TOPUP" if tier.upper() == "TOPUP" else normalize_tier(tier)
    return InvoiceDB(
        id=invoice_id,
        user_id=user_id,
        amount_rub=rub,
        amount=rub,
        credits_usd=credits_usd,
        status=status,
        subscription_tier=normalized_tier,
    )


@router.get("/catalog")
async def billing_catalog():
    rate = await refresh_usd_rub_rate()
    meta = fx_rate_metadata()
    return {
        "currency": "RUB",
        "billing_mode": "monthly_quota",
        "usd_rub_rate": rate,
        "rate_source": meta.get("source") or "cbr",
        "rate_date": meta.get("rate_date"),
        "rate_fetched_at": meta.get("fetched_at"),
        "tiers": public_tiers_list(rate),
        "testing_mode": is_testing_mode(),
        "payment_provider": "yookassa" if yookassa_enabled() else ("test" if NEXUS_BILLING_TEST_MODE else None),
        "yookassa_configured": yookassa_enabled(),
        "promo_codes_enabled": promo_codes_enabled(),
        "promo_hints": public_promo_hints(),
    }


@router.get("/fx")
async def current_fx():
    rate = await refresh_usd_rub_rate()
    meta = fx_rate_metadata()
    return {
        "usd_rub": rate,
        "currency": "RUB",
        "rate_source": meta.get("source"),
        "rate_date": meta.get("rate_date"),
        "rate_fetched_at": meta.get("fetched_at"),
    }


@router.get("/usage-stats")
def get_usage_stats(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    return aggregate_usage_stats(db, current_user)


@router.get("/history")
def get_billing_history(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    rate = get_usd_rub_rate_sync()
    txs = (
        db.query(TransactionDB)
        .filter(TransactionDB.user_id == current_user.id)
        .order_by(TransactionDB.created_at.desc())
        .all()
    )
    return {
        "status": "success",
        "usd_rub_rate": rate,
        "transactions": [
            {
                "amount_usd": tx.amount,
                "amount_rub": usd_to_rub(tx.amount, rate),
                "amount": tx.amount,
                "tx_type": tx.tx_type,
                "description": tx.description,
                "created_at": tx.created_at.isoformat(),
            }
            for tx in txs
        ],
    }


@router.post("/topup")
async def create_topup_invoice(
    payload: TopupRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    amount_rub = float(payload.amount_rub)
    if amount_rub <= 0:
        raise HTTPException(status_code=400, detail="Сумма пополнения должна быть больше нуля.")

    rate = get_usd_rub_rate_sync()
    pool_usd = round(rub_to_usd(amount_rub, rate) * TIER_POOL_FRACTION, 4)

    invoice_id = f"topup_{uuid.uuid4().hex[:8]}"
    invoice = _invoice_row(
        invoice_id=invoice_id,
        user_id=current_user.id,
        amount_rub=amount_rub,
        credits_usd=pool_usd,
        tier="TOPUP",
    )
    db.add(invoice)
    db.commit()

    payment_url: str | None = None
    if yookassa_configured():
        try:
            payment = await create_payment(
                amount_rub=amount_rub,
                description="Пополнение баланса Nexus",
                invoice_id=invoice_id,
                user_id=current_user.id,
                tier="TOPUP",
                customer_email=current_user.email,
            )
            invoice.yookassa_payment_id = payment.get("payment_id")
            db.commit()
            payment_url = payment.get("payment_url")
            if payment.get("paid"):
                result = await fulfill_topup_invoice(db, invoice, trigger="yookassa_immediate")
                return {**result, "invoice_id": invoice_id, "immediate": True}
        except YooKassaError as exc:
            logger.exception("YooKassa create topup payment failed")
            db.delete(invoice)
            db.commit()
            raise HTTPException(status_code=502, detail=f"Не удалось создать платёж ЮKassa: {exc}") from exc
    elif not NEXUS_BILLING_TEST_MODE:
        raise HTTPException(
            status_code=503,
            detail=(
                "Платёжная система временно недоступна. Попробуйте позже или напишите в поддержку."
            ),
        )

    return {
        "status": "pending",
        "invoice_id": invoice_id,
        "amount_rub": amount_rub,
        "amount_usd": round(rub_to_usd(amount_rub, rate), 2),
        "pool_usd": pool_usd,
        "usd_rub_rate": rate,
        "payment_url": payment_url,
        "payment_provider": "yookassa" if payment_url else "test",
        "message": (
            f"Счёт на пополнение {amount_rub:,.0f} ₽ создан. "
            f"Будет зачислено: ≈ ${pool_usd:.2f} на ваш баланс."
        ).replace(",", " "),
    }


@router.get("/topup/check")
async def check_topup_invoice(
    invoice_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not invoice_id.startswith("topup_"):
        raise HTTPException(status_code=400, detail="Неверный ID пополнения")

    invoice = db.query(InvoiceDB).filter(InvoiceDB.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    if invoice.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Чужой счёт")

    if invoice.status == "paid":
        rate = get_usd_rub_rate_sync()
        return {
            "status": "paid",
            "balance_usd": round(current_user.balance, 4),
            "balance_rub": usd_to_rub(current_user.balance, rate),
            "pool_usd": invoice.credits_usd,
            "pool_rub": usd_to_rub(invoice.credits_usd, rate),
        }

    if yookassa_configured() and invoice.yookassa_payment_id:
        try:
            payment = await get_payment(invoice.yookassa_payment_id)
            if payment_is_succeeded(payment):
                return await fulfill_topup_invoice(db, invoice, trigger="yookassa_poll")
        except YooKassaError as exc:
            logger.warning("YooKassa poll %s: %s", invoice.yookassa_payment_id, exc)

    if not NEXUS_BILLING_TEST_MODE:
        raise HTTPException(
            status_code=402,
            detail="Оплата не подтверждена. Завершите оплату на странице ЮKassa или подождите несколько секунд.",
        )

    return await fulfill_topup_invoice(db, invoice, trigger="billing_test_mode")


@router.post("/subscribe")
async def create_subscription_invoice(
    payload: SubscribeRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tier = normalize_tier(payload.tier)
    current = normalize_tier(current_user.subscription_tier)

    if tier == current:
        return {"status": "already", "tier": tier, "message": "Этот тариф уже активен."}

    if tier == "FREE" or tier_rank(tier) < tier_rank(current):
        current_user.subscription_tier = tier
        db.commit()
        await suspend_polza_for_user(current_user, db)
        return {
            "status": "success",
            "immediate": True,
            "tier": tier,
            "message": f"Тариф изменён на {tier}.",
        }

    rate = get_usd_rub_rate_sync()
    price_usd = tier_price(tier)
    quota_usd = tier_monthly_cap(tier)
    amount_rub = usd_to_rub(price_usd, rate)
    quota_rub = usd_to_rub(quota_usd, rate)
    discount_promo = None
    amount_rub, discount_promo = resolve_subscribe_discount(payload.promo_code, amount_rub)

    pool_usd = round(rub_to_usd(amount_rub, rate) * TIER_POOL_FRACTION, 4)
    pool_rub = usd_to_rub(pool_usd, rate)

    invoice_id = f"sub_{tier}_{uuid.uuid4().hex[:8]}"
    invoice = _invoice_row(
        invoice_id=invoice_id,
        user_id=current_user.id,
        amount_rub=amount_rub,
        credits_usd=pool_usd,
        tier=tier,
    )
    db.add(invoice)
    db.commit()

    payment_url: str | None = None
    if yookassa_configured():
        try:
            payment = await create_payment(
                amount_rub=amount_rub,
                description=f"Подписка Nexus {tier}",
                invoice_id=invoice_id,
                user_id=current_user.id,
                tier=tier,
                customer_email=current_user.email,
            )
            invoice.yookassa_payment_id = payment.get("payment_id")
            db.commit()
            payment_url = payment.get("payment_url")
            if payment.get("paid"):
                result = await fulfill_subscription_invoice(db, invoice, trigger="yookassa_immediate")
                return {**result, "invoice_id": invoice_id, "immediate": True}
        except YooKassaError as exc:
            logger.exception("YooKassa create payment failed")
            db.delete(invoice)
            db.commit()
            raise HTTPException(status_code=502, detail=f"Не удалось создать платёж ЮKassa: {exc}") from exc
    elif not NEXUS_BILLING_TEST_MODE:
        raise HTTPException(
            status_code=503,
            detail=(
                "Платёжная система временно недоступна. Попробуйте позже или напишите в поддержку."
            ),
        )

    discount_note = ""
    if discount_promo:
        discount_note = f" (скидка {discount_promo.discount_percent}% по {discount_promo.code})"

    return {
        "status": "pending",
        "invoice_id": invoice_id,
        "tier": tier,
        "amount_rub": amount_rub,
        "amount_usd": price_usd,
        "monthly_quota_usd": pool_usd,
        "monthly_quota_rub": pool_rub,
        "daily_quota_usd": pool_usd,
        "daily_quota_rub": pool_rub,
        "pool_usd": pool_usd,
        "pool_rub": pool_rub,
        "catalog_quota_usd": quota_usd,
        "catalog_quota_rub": quota_rub,
        "usd_rub_rate": rate,
        "payment_url": payment_url,
        "payment_provider": "yookassa" if payment_url else "test",
        "promo_applied": discount_promo.code if discount_promo else None,
        "discount_percent": discount_promo.discount_percent if discount_promo else None,
        "message": (
            f"Счёт {amount_rub:,.0f} ₽ — тариф {tier}{discount_note}. "
            f"Месячный пул ИИ: ≈ {pool_rub:,.0f} ₽ на 30 дней после оплаты."
        ).replace(",", " "),
    }


@router.get("/promo")
def promo_catalog_public():
    return {"enabled": promo_codes_enabled(), "codes": public_promo_hints()}


@router.post("/promo/redeem")
async def redeem_promo(
    payload: PromoRedeemRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return await redeem_promo_code(db, current_user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/subscribe/check")
async def check_subscription_invoice(
    invoice_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not invoice_id.startswith("sub_"):
        raise HTTPException(status_code=400, detail="Неверный ID подписки")

    invoice = db.query(InvoiceDB).filter(InvoiceDB.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    if invoice.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Чужой счёт")

    if invoice.status == "paid":
        from app.services.billing_fulfillment import (
            _polza_status_fields,
            _repair_paid_invoice_entitlements,
            _sync_paid_invoice_polza_with_retry,
        )

        rate = get_usd_rub_rate_sync()
        pool_usd = invoice_pool_usd(invoice, rate=rate)
        pool_rub = usd_to_rub(pool_usd, rate)
        await _repair_paid_invoice_entitlements(
            db, current_user, invoice, trigger="subscribe_check_paid"
        )
        await _sync_paid_invoice_polza_with_retry(
            db, current_user, invoice, pool_usd, trigger="subscribe_check_paid"
        )
        db.refresh(current_user)
        out = {
            "status": "paid",
            "tier": normalize_tier(current_user.subscription_tier),
            "billing_mode": "monthly_quota",
            "monthly_quota_usd": pool_usd,
            "monthly_quota_rub": pool_rub,
            "daily_quota_usd": pool_usd,
            "daily_quota_rub": pool_rub,
            "pool_usd": pool_usd,
            "pool_rub": pool_rub,
            "balance_usd": round(current_user.balance, 4),
            "balance_rub": usd_to_rub(current_user.balance, rate),
        }
        out.update(_polza_status_fields(current_user))
        return out

    if yookassa_configured() and invoice.yookassa_payment_id:
        try:
            payment = await get_payment(invoice.yookassa_payment_id)
            if payment_is_succeeded(payment):
                return await fulfill_subscription_invoice(db, invoice, trigger="yookassa_poll")
        except YooKassaError as exc:
            logger.warning("YooKassa poll %s: %s", invoice.yookassa_payment_id, exc)

    if not NEXUS_BILLING_TEST_MODE:
        raise HTTPException(
            status_code=402,
            detail="Оплата не подтверждена. Завершите оплату на странице ЮKassa или подождите несколько секунд.",
        )

    tier = invoice_tier_from_id(invoice_id)
    if not tier_requires_payment(tier):
        raise HTTPException(status_code=400, detail="Этот счёт не для платного тарифа.")

    return await fulfill_subscription_invoice(db, invoice, trigger="billing_test_mode")


def _payment_amount_rub(payment: dict) -> float | None:
    amount = payment.get("amount") or {}
    value = amount.get("value")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@router.post("/yookassa/webhook")
async def yookassa_webhook(request: Request, db: Session = Depends(get_db)):
    """Уведомления ЮKassa (HTTP notifications в личном кабинете)."""
    if not yookassa_configured():
        raise HTTPException(status_code=503, detail="ЮKassa не настроена")

    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"yookassa:webhook:{client_ip}", 120, 3600.0):
        raise HTTPException(status_code=429, detail="Too many webhook requests")

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    event = payload.get("event") or ""
    obj = payload.get("object") or {}
    payment_id = obj.get("id")
    if not payment_id:
        return {"status": "ignored"}

    if event not in ("payment.succeeded", "payment.waiting_for_capture"):
        return {"status": "ignored", "event": event}

    try:
        payment = await get_payment(payment_id)
    except YooKassaError as exc:
        logger.error("Webhook: cannot verify payment %s: %s", payment_id, exc)
        raise HTTPException(status_code=502, detail="Payment verification failed") from exc

    if not payment_is_succeeded(payment):
        return {"status": "pending", "payment_status": payment.get("status")}

    meta = payment.get("metadata") or {}
    invoice_id = meta.get("invoice_id")
    if not invoice_id:
        invoice = (
            db.query(InvoiceDB).filter(InvoiceDB.yookassa_payment_id == payment_id).first()
        )
    else:
        invoice = db.query(InvoiceDB).filter(InvoiceDB.id == invoice_id).first()

    if not invoice:
        logger.warning("Webhook: invoice not found for payment %s", payment_id)
        return {"status": "invoice_not_found"}

    paid_rub = _payment_amount_rub(payment)
    if paid_rub is not None and abs(paid_rub - float(invoice.amount_rub or 0)) > 0.02:
        logger.error(
            "Webhook: amount mismatch payment=%s invoice=%s paid=%.2f expected=%.2f",
            payment_id,
            invoice.id,
            paid_rub,
            float(invoice.amount_rub or 0),
        )
        raise HTTPException(status_code=400, detail="Payment amount mismatch")

    if not invoice.yookassa_payment_id:
        invoice.yookassa_payment_id = payment_id
        db.commit()

    result = await fulfill_subscription_invoice(db, invoice, trigger="yookassa_webhook")
    return {"status": "ok", **result}
