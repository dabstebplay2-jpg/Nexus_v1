from fastapi import APIRouter, HTTPException

from app.schemas import SubscribePayload, TopupPayload
from app.tokens import cloud_request

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/catalog")
async def billing_catalog():
    res = await cloud_request("GET", "/v1/billing/catalog")
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Не удалось загрузить тарифы")
    return res.json()


@router.get("/fx")
async def billing_fx():
    res = await cloud_request("GET", "/v1/billing/fx")
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Не удалось загрузить курс")
    return res.json()


@router.get("/history")
async def get_billing_history():
    res = await cloud_request("GET", "/v1/billing/history")
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Failed to fetch transactions from cloud")
    return res.json()


@router.post("/topup")
async def create_topup_invoice(payload: TopupPayload):
    res = await cloud_request("POST", "/v1/billing/topup", json_data={"amount_rub": payload.amount_rub})
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Failed to create payment link on cloud")
    return res.json()


@router.get("/topup/check")
async def check_topup_status(invoice_id: str):
    res = await cloud_request("GET", "/v1/billing/topup/check", params={"invoice_id": invoice_id})
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Failed to check payment status on cloud")
    return res.json()


@router.post("/subscribe")
async def create_subscription(payload: SubscribePayload):
    body = {"tier": payload.tier}
    if payload.promo_code:
        body["promo_code"] = payload.promo_code
    res = await cloud_request("POST", "/v1/billing/subscribe", json_data=body)
    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="Войдите в аккаунт.")
    if res.status_code not in (200, 201):
        try:
            detail = res.json().get("detail", res.text)
        except Exception:
            detail = res.text or "Ошибка облачного сервера"
        if res.status_code >= 500:
            detail = "Ошибка сервера при создании счёта. Перезапустите cloud (8080) и попробуйте снова."
        raise HTTPException(status_code=res.status_code, detail=detail)
    return res.json()


@router.get("/promo")
async def billing_promo_catalog():
    res = await cloud_request("GET", "/v1/billing/promo")
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail="Не удалось загрузить промокоды")
    return res.json()


@router.post("/promo/redeem")
async def billing_promo_redeem(body: dict):
    res = await cloud_request("POST", "/v1/billing/promo/redeem", json_data=body)
    if res.status_code != 200:
        detail = res.json().get("detail", res.text) if res.content else res.text
        raise HTTPException(status_code=res.status_code, detail=detail)
    return res.json()


@router.get("/subscribe/check")
async def check_subscription(invoice_id: str):
    res = await cloud_request(
        "GET", "/v1/billing/subscribe/check", params={"invoice_id": invoice_id}
    )
    if res.status_code != 200:
        detail = res.json().get("detail", res.text) if res.content else res.text
        raise HTTPException(status_code=res.status_code, detail=detail)
    return res.json()
