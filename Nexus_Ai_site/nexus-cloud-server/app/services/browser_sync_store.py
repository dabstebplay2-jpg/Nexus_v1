"""Хранение данных синхронизации Nexus Browser."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.database import BrowserSyncDB
from app.time_utils import utc_now

MAX_PAYLOAD_BYTES = 2_000_000


def _row_to_dict(row: BrowserSyncDB | None) -> dict[str, Any]:
    if not row:
        return {"payload": None, "updated_at": None, "client_version": None}
    try:
        payload = json.loads(row.payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "payload": payload,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "client_version": row.client_version,
    }


def get_browser_sync(db: Session, user_id: int) -> dict[str, Any]:
    row = db.query(BrowserSyncDB).filter(BrowserSyncDB.user_id == user_id).first()
    return _row_to_dict(row)


def save_browser_sync(
    db: Session,
    user_id: int,
    *,
    payload: dict[str, Any],
    client_version: str | None = None,
) -> dict[str, Any]:
    raw = json.dumps(payload, ensure_ascii=False)
    if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ValueError("Payload слишком большой")

    row = db.query(BrowserSyncDB).filter(BrowserSyncDB.user_id == user_id).first()
    now = utc_now()
    if not row:
        row = BrowserSyncDB(
            user_id=user_id,
            payload_json=raw,
            client_version=client_version,
            updated_at=now,
        )
        db.add(row)
    else:
        row.payload_json = raw
        row.client_version = client_version
        row.updated_at = now
    db.flush()
    return _row_to_dict(row)
