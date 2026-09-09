"""CRUD for user_connections."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.connectors.catalog import get_catalog_entry, is_mvp_connector
from app.database import UserConnectionDB
from app.services.credentials_vault import decrypt_credentials, encrypt_credentials
from app.time_utils import utc_now


def get_connection(db: Session, user_id: int, connector_id: str) -> UserConnectionDB | None:
    return (
        db.query(UserConnectionDB)
        .filter(
            UserConnectionDB.user_id == user_id,
            UserConnectionDB.connector_id == connector_id,
            UserConnectionDB.status == "connected",
        )
        .first()
    )


def list_user_connections(db: Session, user_id: int) -> list[UserConnectionDB]:
    return (
        db.query(UserConnectionDB)
        .filter(UserConnectionDB.user_id == user_id, UserConnectionDB.status == "connected")
        .order_by(UserConnectionDB.updated_at.desc())
        .all()
    )


def upsert_connection(
    db: Session,
    *,
    user_id: int,
    connector_id: str,
    credentials: dict,
    account_label: str | None = None,
    scopes: str | None = None,
    expires_at: datetime | None = None,
) -> UserConnectionDB:
    if not is_mvp_connector(connector_id) and get_catalog_entry(connector_id) is None:
        raise ValueError("Unknown connector")
    enc = encrypt_credentials(credentials)
    row = get_connection(db, user_id, connector_id)
    if row:
        row.encrypted_credentials = enc
        row.account_label = account_label or row.account_label
        row.scopes = scopes or row.scopes
        row.expires_at = expires_at
        row.status = "connected"
        row.enabled_for_chat = 1
        row.updated_at = utc_now()
    else:
        row = UserConnectionDB(
            user_id=user_id,
            connector_id=connector_id,
            status="connected",
            account_label=account_label,
            scopes=scopes,
            encrypted_credentials=enc,
            enabled_for_chat=1,
            expires_at=expires_at,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def disconnect(db: Session, user_id: int, connector_id: str) -> bool:
    row = (
        db.query(UserConnectionDB)
        .filter(
            UserConnectionDB.user_id == user_id,
            UserConnectionDB.connector_id == connector_id,
            UserConnectionDB.status != "disconnected",
        )
        .first()
    )
    if not row:
        return False
    row.status = "disconnected"
    row.encrypted_credentials = encrypt_credentials({})
    row.enabled_for_chat = 0
    row.updated_at = utc_now()
    db.commit()
    return True


def set_enabled_for_chat(db: Session, user_id: int, connector_id: str, enabled: bool) -> UserConnectionDB | None:
    row = get_connection(db, user_id, connector_id)
    if not row:
        return None
    row.enabled_for_chat = 1 if enabled else 0
    row.updated_at = utc_now()
    db.commit()
    db.refresh(row)
    return row


def get_credentials(row: UserConnectionDB) -> dict:
    return decrypt_credentials(row.encrypted_credentials or "")


def list_chat_enabled(db: Session, user_id: int) -> list[UserConnectionDB]:
    return [
        r
        for r in list_user_connections(db, user_id)
        if r.enabled_for_chat and is_mvp_connector(r.connector_id)
    ]
