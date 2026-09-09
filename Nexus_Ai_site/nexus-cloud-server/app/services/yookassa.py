"""ЮKassa API v3 (https://yookassa.ru/developers)."""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from app.config import (
    NEXUS_FRONTEND_URL,
    YOOKASSA_RETURN_PATH,
    YOOKASSA_SECRET_KEY,
    YOOKASSA_SHOP_ID,
)

logger = logging.getLogger(__name__)

API_BASE = "https://api.yookassa.ru/v3"


class YooKassaError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def yookassa_configured() -> bool:
    return bool(YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY)


def return_url_for_invoice(invoice_id: str) -> str:
    base = NEXUS_FRONTEND_URL.rstrip("/")
    path = YOOKASSA_RETURN_PATH.strip() or "/pricing"
    if not path.startswith("/"):
        path = "/" + path
    sep = "&" if "?" in path else "?"
    return f"{base}{path}{sep}payment=success&invoice_id={invoice_id}"


def _auth() -> tuple[str, str]:
    if not yookassa_configured():
        raise YooKassaError("ЮKassa не настроена (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)")
    return YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY


async def create_payment(
    *,
    amount_rub: float,
    description: str,
    invoice_id: str,
    user_id: int,
    tier: str,
    customer_email: str | None = None,
) -> dict[str, Any]:
    """Создать платёж с редиректом на страницу ЮKassa."""
    value = f"{float(amount_rub):.2f}"
    body: dict[str, Any] = {
        "amount": {"value": value, "currency": "RUB"},
        "capture": True,
        "confirmation": {
            "type": "redirect",
            "return_url": return_url_for_invoice(invoice_id),
        },
        "description": description[:128],
        "metadata": {
            "invoice_id": invoice_id,
            "user_id": str(user_id),
            "tier": tier,
        },
    }
    if customer_email:
        body["receipt"] = {
            "customer": {"email": customer_email},
            "items": [
                {
                    "description": description[:128],
                    "quantity": "1.00",
                    "amount": {"value": value, "currency": "RUB"},
                    "vat_code": 1,
                    "payment_mode": "full_payment",
                    "payment_subject": "service",
                }
            ],
        }

    idempotence_key = str(uuid.uuid4())
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{API_BASE}/payments",
            json=body,
            auth=_auth(),
            headers={
                "Idempotence-Key": idempotence_key,
                "Content-Type": "application/json",
            },
        )
    if response.status_code >= 400:
        logger.error("YooKassa create payment %s: %s", response.status_code, response.text[:500])
        raise YooKassaError(response.text[:300], status_code=response.status_code)

    data = response.json()
    confirmation = data.get("confirmation") or {}
    return {
        "payment_id": data.get("id"),
        "status": data.get("status"),
        "payment_url": confirmation.get("confirmation_url"),
        "paid": data.get("paid", False),
        "raw": data,
    }


async def get_payment(payment_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{API_BASE}/payments/{payment_id}",
            auth=_auth(),
            headers={"Content-Type": "application/json"},
        )
    if response.status_code >= 400:
        raise YooKassaError(response.text[:300], status_code=response.status_code)
    return response.json()


def payment_is_succeeded(payment: dict[str, Any]) -> bool:
    return (payment.get("status") or "").lower() == "succeeded" and bool(payment.get("paid"))
