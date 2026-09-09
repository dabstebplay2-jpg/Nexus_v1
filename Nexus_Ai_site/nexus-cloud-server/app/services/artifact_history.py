import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.database import UserArtifactDB
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

MAX_ARTIFACTS_PER_USER = 200
MAX_PREVIEW_CHARS = 3_500_000
MAX_CONTENT_JSON_BYTES = 3_500_000
ALLOWED_KINDS = frozenset({"image", "code", "file", "export", "research"})


def _ms_to_dt(value: int | float | None) -> datetime:
    if value is None:
        return utc_now()
    try:
        sec = float(value) / 1000.0 if float(value) > 1e12 else float(value)
        return datetime.utcfromtimestamp(sec)
    except (TypeError, ValueError, OSError):
        return utc_now()


def _dt_to_ms(dt: datetime | None) -> int:
    if not dt:
        return int(utc_now().timestamp() * 1000)
    return int(dt.timestamp() * 1000)


def _sanitize_content(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key in ("url", "dataUrl", "mime", "language", "fileName", "code", "prompt"):
        if key in raw and raw[key] is not None:
            val = raw[key]
            if key in ("url", "mime", "language", "fileName", "prompt"):
                out[key] = str(val)[:4096]
            elif key == "code":
                out[key] = str(val)[:120_000]
            elif key == "dataUrl" and isinstance(val, str) and val.startswith("data:"):
                if len(val) <= MAX_CONTENT_JSON_BYTES:
                    out[key] = val
    return out


def row_to_payload(row: UserArtifactDB) -> dict:
    try:
        content = json.loads(row.content_json or "{}")
        if not isinstance(content, dict):
            content = {}
    except json.JSONDecodeError:
        content = {}
    return {
        "id": row.id,
        "kind": row.kind,
        "title": row.title or "Артефакт",
        "preview": row.preview,
        "content": content,
        "sourceChatId": row.source_chat_id,
        "sourceMessageId": row.source_message_id,
        "createdAt": _dt_to_ms(row.created_at),
    }


def list_user_artifacts(db: Session, user_id: int) -> list[UserArtifactDB]:
    return (
        db.query(UserArtifactDB)
        .filter(UserArtifactDB.user_id == user_id)
        .order_by(UserArtifactDB.created_at.desc())
        .limit(MAX_ARTIFACTS_PER_USER)
        .all()
    )


def upsert_artifact(db: Session, *, user_id: int, data: dict) -> UserArtifactDB:
    art_id = str(data.get("id") or "")[:64]
    if not art_id:
        raise ValueError("artifact id required")
    kind = str(data.get("kind") or "file")[:32]
    if kind not in ALLOWED_KINDS:
        kind = "file"
    title = (str(data.get("title") or "Артефакт"))[:256]
    preview = data.get("preview")
    if isinstance(preview, str) and len(preview) > MAX_PREVIEW_CHARS:
        logger.warning("artifact preview too large (%s), omit preview field", len(preview))
        preview = None
    content = _sanitize_content(data.get("content"))
    data_url = content.get("dataUrl")
    if isinstance(data_url, str) and len(data_url) > MAX_PREVIEW_CHARS:
        logger.warning("artifact content.dataUrl too large (%s), omit", len(data_url))
        content.pop("dataUrl", None)
    content_json = json.dumps(content, ensure_ascii=False, separators=(",", ":"))
    if len(content_json.encode("utf-8")) > MAX_CONTENT_JSON_BYTES:
        logger.warning("artifact content_json too large, storing metadata only")
        content_json = json.dumps(
            {
                "truncated": True,
                "prompt": content.get("prompt", ""),
                "url": content.get("url", ""),
            },
            ensure_ascii=False,
        )

    row = (
        db.query(UserArtifactDB)
        .filter(UserArtifactDB.id == art_id, UserArtifactDB.user_id == user_id)
        .first()
    )
    created_at = _ms_to_dt(data.get("createdAt"))
    if row:
        row.kind = kind
        row.title = title
        row.preview = preview if isinstance(preview, str) else row.preview
        row.content_json = content_json
        row.source_chat_id = (str(data["sourceChatId"])[:64] if data.get("sourceChatId") else None)
        row.source_message_id = (
            str(data["sourceMessageId"])[:64] if data.get("sourceMessageId") else None
        )
    else:
        row = UserArtifactDB(
            id=art_id,
            user_id=user_id,
            kind=kind,
            title=title,
            preview=preview if isinstance(preview, str) else None,
            content_json=content_json,
            source_chat_id=(str(data["sourceChatId"])[:64] if data.get("sourceChatId") else None),
            source_message_id=(
                str(data["sourceMessageId"])[:64] if data.get("sourceMessageId") else None
            ),
            created_at=created_at,
        )
        db.add(row)
    return row


def trim_old_artifacts(db: Session, user_id: int) -> None:
    rows = list_user_artifacts(db, user_id)
    if len(rows) <= MAX_ARTIFACTS_PER_USER:
        return
    for row in rows[MAX_ARTIFACTS_PER_USER:]:
        db.delete(row)
