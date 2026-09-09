import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.database import ChatConversationDB
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

MAX_CONVERSATIONS_PER_USER = 80
MAX_MESSAGES_PER_CONV = 150
MAX_CONTENT_CHARS = 120_000
MAX_MESSAGES_JSON_BYTES = 2_500_000
MAX_ATTACHMENTS_PER_MSG = 12
MAX_IMAGES_PER_MSG = 8
MAX_IMAGE_URL_CHARS = 4096
MAX_IMAGE_DATA_URL_CHARS = 3_500_000


def _sanitize_attachments(raw: Any) -> list[dict] | None:
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for item in raw[:MAX_ATTACHMENTS_PER_MSG]:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "file")[:16]
        entry: dict[str, Any] = {
            "kind": kind,
            "name": str(item.get("name") or "")[:256],
            "mime": str(item.get("mime") or "")[:128],
        }
        if item.get("previewUrl"):
            pv = str(item["previewUrl"])
            if len(pv) <= MAX_IMAGE_DATA_URL_CHARS:
                entry["previewUrl"] = pv
        if item.get("textPreview"):
            entry["textPreview"] = str(item["textPreview"])[:500]
        out.append(entry)
    return out or None


def _sanitize_images(raw: Any) -> list[dict] | None:
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for item in raw[:MAX_IMAGES_PER_MSG]:
        if not isinstance(item, dict):
            continue
        entry: dict[str, Any] = {}
        if item.get("artifactId"):
            entry["artifactId"] = str(item["artifactId"])[:64]
        data_url = item.get("dataUrl") or item.get("data_url")
        if isinstance(data_url, str) and data_url.startswith("data:"):
            if len(data_url) <= MAX_IMAGE_DATA_URL_CHARS:
                entry["dataUrl"] = data_url
        url = item.get("url")
        if isinstance(url, str) and url:
            if url.startswith("data:"):
                if len(url) <= MAX_IMAGE_DATA_URL_CHARS and "dataUrl" not in entry:
                    entry["dataUrl"] = url
            elif len(url) <= MAX_IMAGE_URL_CHARS:
                entry["url"] = url
        if entry:
            out.append(entry)
    return out or None


def _ms_to_dt(value: int | float | None) -> datetime:
    if value is None:
        return utc_now()
    try:
        sec = float(value) / 1000.0 if float(value) > 1e12 else float(value)
        return datetime.fromtimestamp(sec, timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return utc_now()


def _dt_to_ms(dt: datetime | None) -> int:
    if not dt:
        return int(utc_now().timestamp() * 1000)
    return int(dt.timestamp() * 1000)


def sanitize_messages(raw: list[Any]) -> list[dict]:
    out: list[dict] = []
    if not isinstance(raw, list):
        return out
    for item in raw[-MAX_MESSAGES_PER_CONV:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("user", "assistant", "system"):
            continue
        content = str(item.get("content") or "")[:MAX_CONTENT_CHARS]
        msg: dict[str, Any] = {
            "role": role,
            "content": content,
        }
        if item.get("id"):
            msg["id"] = str(item["id"])[:64]
        if item.get("at") is not None:
            msg["at"] = item["at"]
        if item.get("model"):
            msg["model"] = str(item["model"])[:128]
        if role == "assistant" and item.get("thinking"):
            msg["thinking"] = str(item["thinking"])[:MAX_CONTENT_CHARS]
        if isinstance(item.get("codeFiles"), list):
            msg["codeFiles"] = item["codeFiles"][:24]
        if isinstance(item.get("sources"), list):
            msg["sources"] = item["sources"][:40]
        attachments = _sanitize_attachments(item.get("attachments"))
        if attachments:
            msg["attachments"] = attachments
        images = _sanitize_images(item.get("images"))
        if images:
            msg["images"] = images
        out.append(msg)
    return out


def messages_to_json(messages: list[dict]) -> str:
    sanitized = sanitize_messages(messages)
    payload = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode("utf-8")) > MAX_MESSAGES_JSON_BYTES:
        trimmed = sanitized[-max(10, MAX_MESSAGES_PER_CONV // 2) :]
        payload = json.dumps(trimmed, ensure_ascii=False, separators=(",", ":"))
    return payload


def messages_from_json(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return sanitize_messages(data if isinstance(data, list) else [])
    except json.JSONDecodeError:
        logger.warning("chat_history: invalid messages_json")
        return []


def row_to_payload(row: ChatConversationDB) -> dict:
    return {
        "id": row.id,
        "title": row.title or "Новый чат",
        "model": row.model,
        "messages": messages_from_json(row.messages_json),
        "createdAt": _dt_to_ms(row.created_at),
        "updatedAt": _dt_to_ms(row.updated_at),
        "workspaceId": row.workspace_id,
    }


def upsert_conversation(
    db: Session,
    *,
    user_id: int,
    conv: dict,
    workspace_id: str | None = None,
) -> ChatConversationDB:
    conv_id = str(conv.get("id") or "")[:64]
    if not conv_id:
        raise ValueError("conversation id required")

    row = (
        db.query(ChatConversationDB)
        .filter(
            ChatConversationDB.id == conv_id,
            ChatConversationDB.user_id == user_id,
        )
        .first()
    )
    messages = conv.get("messages") or []
    messages_json = messages_to_json(messages)
    title = (str(conv.get("title") or "Новый чат"))[:256]
    model = conv.get("model")
    model_str = str(model)[:128] if model else None
    updated_at = _ms_to_dt(conv.get("updatedAt"))
    created_at = _ms_to_dt(conv.get("createdAt")) if conv.get("createdAt") else updated_at

    if row:
        row.title = title
        row.model = model_str
        row.messages_json = messages_json
        row.updated_at = updated_at
        row.workspace_id = workspace_id
    else:
        row = ChatConversationDB(
            id=conv_id,
            user_id=user_id,
            title=title,
            model=model_str,
            messages_json=messages_json,
            workspace_id=workspace_id,
            created_at=created_at,
            updated_at=updated_at,
        )
        db.add(row)
    return row


def list_user_chats(db: Session, user_id: int, *, workspace_id: str | None = None) -> list[ChatConversationDB]:
    q = db.query(ChatConversationDB).filter(ChatConversationDB.user_id == user_id)
    if workspace_id is None:
        q = q.filter(ChatConversationDB.workspace_id.is_(None))
    else:
        q = q.filter(ChatConversationDB.workspace_id == workspace_id)
    return q.order_by(ChatConversationDB.updated_at.desc()).limit(MAX_CONVERSATIONS_PER_USER).all()


def trim_old_conversations(db: Session, user_id: int, *, workspace_id: str | None = None) -> None:
    query = db.query(ChatConversationDB).filter(ChatConversationDB.user_id == user_id)
    if workspace_id is None:
        query = query.filter(ChatConversationDB.workspace_id.is_(None))
    else:
        query = query.filter(ChatConversationDB.workspace_id == workspace_id)
    rows = (
        query.order_by(ChatConversationDB.updated_at.desc())
        .offset(MAX_CONVERSATIONS_PER_USER)
        .all()
    )
    for row in rows:
        db.delete(row)
