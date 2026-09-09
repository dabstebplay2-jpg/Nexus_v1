"""Глобальная память пользователя: хранение и подстановка в запросы к модели."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.database import UserMemoryDB
from app.services.chat_history import list_user_chats
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

MAX_MEMORY_CHARS = 8_000
MAX_SYNTHESIS_INPUT_CHARS = 50_000

MEMORY_SYSTEM_PREFIX = (
    "Ниже — сохранённая память о пользователе (факты, предпочтения, контекст). "
    "Учитывай при ответах. Не пересказывай память дословно, если пользователь об этом не просит.\n\n"
)

SYNTHESIZE_SYSTEM = (
    "Ты составляешь файл памяти о пользователе для ИИ-ассистента. "
    "На основе фрагментов переписки выпиши на русском структурированный документ с разделами: "
    "Кто я, Работа и проекты, Цели, Стиль общения, Технологии и инструменты, "
    "Ограничения и предпочтения, Прочие факты. "
    "Используй маркированные списки. Будь конкретным. Не выдумывай то, чего нет в переписке. "
    f"Максимум {MAX_MEMORY_CHARS} символов."
)


def format_memory_system_block(content: str) -> str:
    return f"{MEMORY_SYSTEM_PREFIX}{content.strip()}"


def inject_user_memory_messages(
    messages: list[dict[str, Any]], memory_content: str | None
) -> list[dict[str, Any]]:
    text = (memory_content or "").strip()
    if not text:
        return messages
    block = {"role": "system", "content": format_memory_system_block(text)}
    return [block, *messages]


def _row_to_dict(row: UserMemoryDB | None) -> dict[str, Any]:
    if not row:
        return {"content": "", "enabled": True, "auto_learn": True, "updated_at": None}
    return {
        "content": (row.content or "")[:MAX_MEMORY_CHARS],
        "enabled": bool(row.enabled),
        "auto_learn": bool(getattr(row, "auto_learn", 1)),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_memory_row(db: Session, user_id: int) -> UserMemoryDB:
    row = db.query(UserMemoryDB).filter(UserMemoryDB.user_id == user_id).first()
    if row:
        return row
    row = UserMemoryDB(
        user_id=user_id, content="", enabled=1, auto_learn=1, updated_at=utc_now()
    )
    db.add(row)
    db.flush()
    return row


def get_memory_payload(db: Session, user_id: int) -> dict[str, Any]:
    return _row_to_dict(get_memory_row(db, user_id))


def get_enabled_memory_text(db: Session, user_id: int) -> str | None:
    row = db.query(UserMemoryDB).filter(UserMemoryDB.user_id == user_id).first()
    if not row or not row.enabled:
        return None
    text = (row.content or "").strip()
    return text[:MAX_MEMORY_CHARS] if text else None


def save_memory(
    db: Session,
    user_id: int,
    *,
    content: str,
    enabled: bool,
    auto_learn: bool | None = None,
) -> dict[str, Any]:
    row = get_memory_row(db, user_id)
    row.content = (content or "")[:MAX_MEMORY_CHARS]
    row.enabled = 1 if enabled else 0
    if auto_learn is not None:
        row.auto_learn = 1 if auto_learn else 0
    row.updated_at = utc_now()
    db.flush()
    return _row_to_dict(row)


def collect_chat_excerpt(db: Session, user_id: int) -> str:
    """Собирает текст из облачных чатов для synthesize."""
    rows = list_user_chats(db, user_id, workspace_id=None)
    rows.sort(key=lambda r: r.updated_at or r.created_at, reverse=True)
    parts: list[str] = []
    total = 0
    for row in rows[:40]:
        try:
            messages = json.loads(row.messages_json or "[]")
        except json.JSONDecodeError:
            continue
        if not isinstance(messages, list):
            continue
        title = (row.title or "Чат").strip()
        chunk_lines = [f"### {title}"]
        for msg in reversed(messages[-30:]):
            if not isinstance(msg, dict):
                continue
            role = str(msg.get("role") or "")
            if role not in ("user", "assistant"):
                continue
            content = msg.get("content")
            if isinstance(content, list):
                text = ""
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text = str(part.get("text") or "")
                        break
            else:
                text = str(content or "")
            text = text.strip()
            if not text or text.startswith("🎨") or text.startswith("🔍"):
                continue
            label = "Пользователь" if role == "user" else "Ассистент"
            line = f"{label}: {text[:2000]}"
            if total + len(line) > MAX_SYNTHESIS_INPUT_CHARS:
                break
            chunk_lines.append(line)
            total += len(line)
        if len(chunk_lines) > 1:
            parts.append("\n".join(chunk_lines))
        if total >= MAX_SYNTHESIS_INPUT_CHARS:
            break
    return "\n\n".join(parts)
