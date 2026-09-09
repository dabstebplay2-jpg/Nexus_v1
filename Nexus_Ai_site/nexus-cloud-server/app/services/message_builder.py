"""Сборка multipart-сообщений и RouterAI payload для чата с вложениями."""

from __future__ import annotations

import base64
import re
from typing import Any

from fastapi import HTTPException, status

from app.schemas import ChatAttachment, ChatMessage, SimpleChatRequest
from app.services import models_registry as reg
from app.services.user_memory import inject_user_memory_messages

MAX_IMAGE_ATTACHMENTS = 5
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_FILE_TEXT_CHARS = 32_000

_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)


def _has_image_attachments(attachments: list[ChatAttachment]) -> bool:
    return any(a.kind == "image" for a in attachments)


def _decode_image_data(att: ChatAttachment) -> tuple[str, bytes]:
    raw = (att.data_base64 or "").strip()
    mime = att.mime or "image/png"
    if raw.startswith("data:"):
        m = _DATA_URL_RE.match(raw)
        if not m:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Некорректный data URL для «{att.name}».",
            )
        mime = m.group(1) or mime
        raw = m.group(2)
    try:
        data = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Не удалось прочитать изображение «{att.name}».",
        ) from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Изображение «{att.name}» слишком большое (макс. {MAX_IMAGE_BYTES // (1024 * 1024)} МБ).",
        )
    return mime, data


def _image_data_url(att: ChatAttachment) -> str:
    mime, data = _decode_image_data(att)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _file_text_block(att: ChatAttachment) -> str:
    text = (att.text or "").strip()
    if not text:
        return f"[Вложение «{att.name}» пусто или не прочитано]"
    if len(text) > MAX_FILE_TEXT_CHARS:
        text = text[:MAX_FILE_TEXT_CHARS] + "\n… (обрезано)"
    return f"Вложение «{att.name}»:\n```\n{text}\n```"


def build_user_content(text: str, attachments: list[ChatAttachment]) -> str | list[dict[str, Any]]:
    """Собирает content для последнего user-сообщения."""
    parts: list[dict[str, Any]] = []
    trimmed = (text or "").strip()
    if trimmed:
        parts.append({"type": "text", "text": trimmed})

    image_count = 0
    for att in attachments:
        if att.kind == "image":
            image_count += 1
            if image_count > MAX_IMAGE_ATTACHMENTS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Не более {MAX_IMAGE_ATTACHMENTS} изображений в одном сообщении.",
                )
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": _image_data_url(att)},
                }
            )
        elif att.kind == "file":
            file_text = _file_text_block(att)
            if parts and parts[-1].get("type") == "text":
                parts[-1]["text"] = parts[-1]["text"] + "\n\n" + file_text
            else:
                parts.append({"type": "text", "text": file_text})

    if not parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сообщение пустое: добавьте текст или вложение.",
        )
    if len(parts) == 1 and parts[0].get("type") == "text":
        return parts[0]["text"]
    return parts


def assert_model_accepts_images(model_id: str, attachments: list[ChatAttachment]) -> None:
    if not _has_image_attachments(attachments):
        return
    m = reg.get_model(model_id)
    if m and m.get("accepts_photo_analysis"):
        return
    if m and (m.get("supports_vision") or m.get("multimodal")):
        return
    hint = (
        "Выберите модель с пометкой «Фото» (например Gemini 3.5 Flash, GPT-5.4, Claude Sonnet 4.6)."
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Модель не принимает фотографии. {hint}",
    )


def router_modalities_for_model(model_id: str) -> list[str] | None:
    m = reg.get_model(model_id) or {}
    if m.get("category") == "media" or m.get("supports_image_gen"):
        outputs = m.get("output_modalities") or []
        if "text" in outputs:
            return ["image", "text"]
        return ["image"]
    return None


def build_router_messages(
    messages: list[ChatMessage],
    attachments: list[ChatAttachment],
) -> list[dict[str, Any]]:
    """Преобразует сообщения + вложения в формат RouterAI."""
    out: list[dict[str, Any]] = []
    for i, msg in enumerate(messages):
        is_last = i == len(messages) - 1
        if is_last and msg.role == "user" and attachments:
            base_text = msg.content if isinstance(msg.content, str) else ""
            if isinstance(msg.content, list):
                for part in msg.content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        base_text = str(part.get("text") or "")
                        break
            content = build_user_content(base_text, attachments)
            out.append({"role": msg.role, "content": content})
        else:
            out.append(msg.model_dump())
    return out


_SAME_MODEL_REASONING_IDS = frozenset(
    {
        "openai/gpt-5.4",
        "moonshotai/kimi-k2.6",
    }
)


def _reasoning_enabled_for_request(model_id: str, payload: SimpleChatRequest) -> bool:
    if not payload.enable_thinking:
        return False
    mid = (model_id or "").strip()
    meta = reg.get_model(mid)
    if meta:
        if meta.get("thinking_via_reasoning_api"):
            return True
        std = meta.get("model_id_standard") or meta.get("id")
        th = meta.get("model_id_thinking")
        if meta.get("supports_thinking") and th and std and th == std:
            return True
    return mid.lower() in _SAME_MODEL_REASONING_IDS


def build_router_payload(
    model_id: str,
    payload: SimpleChatRequest,
    *,
    memory_content: str | None = None,
) -> dict[str, Any]:
    from app.services.browser_context import inject_page_context_messages

    assert_model_accepts_images(model_id, payload.attachments)
    messages = build_router_messages(payload.messages, payload.attachments)
    messages = inject_page_context_messages(messages, payload.page_context)
    if payload.browser_agent:
        from app.services.browser_agent_prompt import inject_browser_agent_prompt

        messages = inject_browser_agent_prompt(messages, payload.browser_agent_steps)
    messages = inject_user_memory_messages(messages, memory_content)
    body: dict[str, Any] = {"model": model_id, "messages": messages}
    modalities = router_modalities_for_model(model_id)
    if modalities:
        body["modalities"] = modalities
    if _reasoning_enabled_for_request(model_id, payload):
        # GPT-5.x / Kimi K2.6: та же модель в логах, reasoning отдельными токенами
        body["reasoning"] = {"enabled": True, "effort": "medium"}
        body["include_reasoning"] = True
    return body


def extract_message_images(message: dict | None) -> list[dict[str, str]]:
    if not message:
        return []
    raw = message.get("images") or []
    out: list[dict[str, str]] = []
    for img in raw:
        if not isinstance(img, dict):
            continue
        url = (img.get("image_url") or {}).get("url") if isinstance(img.get("image_url"), dict) else None
        if not url and isinstance(img.get("url"), str):
            url = img["url"]
        if url:
            out.append({"url": url})
    return out
