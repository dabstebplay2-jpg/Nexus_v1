"""OAuth state for connector flows."""

from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import OAUTH_STATE_TTL_SEC
from app.database import ConnectorOAuthStateDB
from app.services.oauth_redirect import normalize_return_to
from app.time_utils import utc_now


def create_connector_oauth_state(
    db: Session,
    *,
    user_id: int,
    connector_id: str,
    pkce_verifier: str,
    return_to: str | None,
) -> str:
    state = secrets.token_urlsafe(32)
    expires = utc_now() + timedelta(seconds=OAUTH_STATE_TTL_SEC)
    db.add(
        ConnectorOAuthStateDB(
            state=state,
            user_id=user_id,
            connector_id=connector_id,
            pkce_verifier=pkce_verifier,
            return_to=normalize_return_to(return_to),
            expires_at=expires,
        )
    )
    db.commit()
    return state


def pop_connector_oauth_state(db: Session, state: str) -> tuple[int, str, str, str | None]:
    row = db.query(ConnectorOAuthStateDB).filter(ConnectorOAuthStateDB.state == state).first()
    if not row:
        raise ValueError("Сессия OAuth истекла или недействительна")
    if row.expires_at < utc_now():
        db.delete(row)
        db.commit()
        raise ValueError("Сессия OAuth истекла")
    user_id = row.user_id
    connector_id = row.connector_id
    verifier = row.pkce_verifier
    return_to = row.return_to
    db.delete(row)
    db.commit()
    return user_id, connector_id, verifier, return_to
