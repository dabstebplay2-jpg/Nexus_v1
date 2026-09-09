"""Чат и генерация изображений для Telegram — тот же pipeline, что веб /ai."""

from __future__ import annotations

import logging
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models_catalog
from app.database import UserDB
from app.schemas import ChatMessage, SimpleChatRequest
from app.services.image_materialize import materialize_image_list
from app.services.message_builder import build_router_payload, extract_message_images
from app.services.telegram_model_store import get_selected_model
from app.services.user_memory import get_enabled_memory_text

logger = logging.getLogger(__name__)

_IMAGE_INTENT_RE = re.compile(
    r"(^/image\b|"
    r"нарисуй|сгенерируй|создай|нарисовать|сгенерировать|"
    r"картинк|изображен|иллюстрац|picture|draw\b|generate\s+image)",
    re.IGNORECASE,
)


class TelegramChatError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def looks_like_image_request(text: str) -> bool:
    return bool(_IMAGE_INTENT_RE.search((text or "").strip()))


def _http_detail_to_message(detail) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts = []
        for item in detail:
            if isinstance(item, dict) and item.get("msg"):
                parts.append(str(item["msg"]))
            else:
                parts.append(str(item))
        return " ".join(parts) if parts else "Ошибка запроса."
    return str(detail) if detail else "Ошибка запроса."


def _raise_from_http(exc: HTTPException) -> None:
    raise TelegramChatError(_http_detail_to_message(exc.detail)) from exc


async def _resolve_model(user: UserDB, model: str | None, *, media: bool = False) -> str:
    from app.routers import ai as ai_router

    if media:
        models = await models_catalog.list_media_models_for_user(user.subscription_tier)
        if not models:
            raise TelegramChatError("На вашем тарифе нет моделей для генерации изображений.")
        if model:
            await ai_router._check_model_access(user, model)
            return model
        selected = get_selected_model(int(user.telegram_id or 0))
        if selected:
            for m in models:
                if m.get("id") == selected:
                    return selected
        return models[0]["id"]

    if model:
        await ai_router._check_model_access(user, model)
        return model

    selected = get_selected_model(int(user.telegram_id or 0))
    if selected:
        try:
            await ai_router._check_model_access(user, selected)
            return selected
        except HTTPException:
            pass

    return await models_catalog.get_default_model(user.subscription_tier)


async def run_telegram_chat(
    user: UserDB,
    db: Session,
    text: str,
    *,
    model: str | None = None,
    force_image: bool = False,
) -> dict:
    """Возвращает {reply, images, model}."""
    from app.routers import ai as ai_router

    text = (text or "").strip()
    if not text:
        raise TelegramChatError("Пустое сообщение.")

    try:
        await ai_router._check_tier_ai_access(user, db)
        ai_router._check_quota_limit(db, user)
    except HTTPException as exc:
        _raise_from_http(exc)

    db.refresh(user)
    is_image = force_image or looks_like_image_request(text)
    resolved_model = await _resolve_model(user, model, media=is_image)

    if is_image:
        prompt = re.sub(r"^/image\s*", "", text, flags=re.IGNORECASE).strip() or text
    else:
        prompt = text

    payload = SimpleChatRequest(
        model=resolved_model,
        messages=[ChatMessage(role="user", content=prompt)],
    )
    memory_text = get_enabled_memory_text(db, user.id)
    router_body = build_router_payload(resolved_model, payload, memory_content=memory_text)

    try:
        data = await ai_router._call_polza(router_body, user, db)
    except HTTPException as exc:
        _raise_from_http(exc)

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    try:
        await ai_router._apply_billing_safe(db, user, model=resolved_model, usage=data.get("usage"))
    except HTTPException as exc:
        _raise_from_http(exc)

    reply_images = await materialize_image_list(extract_message_images(message))
    reply_text = (message.get("content") or "").strip()

    if is_image and not reply_images and not reply_text:
        reply_text = "Модель не вернула изображение. Попробуйте другую формулировку или /model."

    return {
        "reply": reply_text,
        "images": reply_images,
        "model": resolved_model,
    }
