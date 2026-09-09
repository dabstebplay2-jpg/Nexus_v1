"""Audit log for connector tool calls."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.database import ConnectorAuditLogDB


def log_connector_action(
    db: Session,
    *,
    user_id: int,
    connector_id: str,
    action: str,
    meta: dict | None = None,
) -> None:
    db.add(
        ConnectorAuditLogDB(
            user_id=user_id,
            connector_id=connector_id,
            action=action[:128],
            meta_json=json.dumps(meta or {}, ensure_ascii=False),
        )
    )
    db.commit()
