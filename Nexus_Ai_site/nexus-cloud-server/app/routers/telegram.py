"""Telegram: привязка аккаунта и webhook."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import (
    TELEGRAM_BOT_USERNAME,
    TELEGRAM_WEBHOOK_SECRET,
    telegram_bot_enabled,
)
from app.database import UserDB, get_db
from app.schemas import MessageResponse, TelegramExchangeRequest
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.telegram_auth import link_telegram_from_exchange
from app.services.telegram_link import build_deep_link, create_link_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/telegram", tags=["telegram"])


class LinkTokenResponse(BaseModel):
    url: str
    expires_in: int
    bot_username: str


@router.post("/link-token", response_model=LinkTokenResponse)
def create_telegram_link_token(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"tg_link:user:{current_user.id}", 5, 3600.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов ссылки. Попробуйте позже.",
        )

    token, ttl = create_link_token(current_user.id)
    return LinkTokenResponse(
        url=build_deep_link(token),
        expires_in=ttl,
        bot_username=TELEGRAM_BOT_USERNAME,
    )


@router.post("/link-from-exchange", response_model=MessageResponse)
def link_telegram_from_exchange_route(
    payload: TelegramExchangeRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Привязать Telegram к текущему аккаунту по ссылке «Открыть Nexus» из бота (вместо отдельного TG-аккаунта)."""
    if not check_rate_limit(f"tg_link_ex:user:{current_user.id}", 10, 3600.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много попыток. Попробуйте позже.",
        )
    try:
        link_telegram_from_exchange(db, current_user, payload.code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MessageResponse(message="Telegram привязан к вашему аккаунту.")


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
):
    if not telegram_bot_enabled():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Telegram bot disabled")

    if TELEGRAM_WEBHOOK_SECRET:
        if x_telegram_bot_api_secret_token != TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook secret")

    from aiogram.types import Update

    from app.services.telegram_bot import get_bot_and_dispatcher

    bot, dp = get_bot_and_dispatcher()
    if not bot or not dp:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Bot not initialized")

    try:
        payload = await request.json()
        update = Update.model_validate(payload)
        await dp.feed_update(bot, update)
    except Exception as exc:
        logger.exception("telegram webhook error: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bad update") from exc

    return {"ok": True}
