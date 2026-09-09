"""OAuth state / exchange codes — Redis on Render (multi-instance), SQLite locally."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import AUTH_EXCHANGE_CODE_TTL_SEC, redis_persistence_enabled
from app.database import AuthExchangeCodeDB, OAuthStateDB
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

_STATE_PREFIX = "nexus:v1:oauth:state:"
_EXCHANGE_PREFIX = "nexus:v1:oauth:exchange:"


def _redis():
    from app.services.redis_sync import _redis_client

    return _redis_client()


def _redis_setex(key: str, ttl: int, value: str) -> None:
    client = _redis()
    try:
        client.setex(key, ttl, value)
    except TypeError:
        client.set(key, value, ex=ttl)


def _persist_state_row(
    db: Session, *, state: str, pkce_verifier: str, return_to: str | None, expires_at: datetime
) -> None:
    db.query(OAuthStateDB).filter(OAuthStateDB.expires_at < utc_now()).delete()
    db.merge(
        OAuthStateDB(
            state=state,
            pkce_verifier=pkce_verifier,
            return_to=return_to,
            expires_at=expires_at,
        )
    )
    db.commit()


def save_oauth_state(
    db: Session, *, state: str, pkce_verifier: str, return_to: str | None, expires_at: datetime
) -> None:
    ttl = max(60, int((expires_at - utc_now()).total_seconds()))
    payload = json.dumps(
        {"pkce_verifier": pkce_verifier, "return_to": return_to or "", "expires_at": expires_at.isoformat()},
        ensure_ascii=False,
    )

    if redis_persistence_enabled():
        try:
            _redis_setex(f"{_STATE_PREFIX}{state}", ttl, payload)
        except Exception as exc:
            logger.warning("Redis oauth state save failed, using DB only: %s", exc)

    _persist_state_row(
        db, state=state, pkce_verifier=pkce_verifier, return_to=return_to, expires_at=expires_at
    )


def _parse_state_payload(raw: str) -> tuple[str, str]:
    data = json.loads(raw) if isinstance(raw, str) else raw
    exp = datetime.fromisoformat(str(data["expires_at"]).replace("Z", "+00:00"))
    if exp.tzinfo is not None:
        exp = exp.astimezone().replace(tzinfo=None)
    if exp < utc_now():
        raise ValueError("Сессия OAuth истекла. Попробуйте снова.")
    return data.get("return_to") or "", data["pkce_verifier"]


def pop_oauth_state(db: Session, state: str) -> tuple[str, str]:
    """Returns (return_to, pkce_verifier). Raises ValueError if missing/expired."""
    if redis_persistence_enabled():
        key = f"{_STATE_PREFIX}{state}"
        try:
            raw = _redis().get(key)
            if raw:
                _redis().delete(key)
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            if raw:
                return _parse_state_payload(raw)
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("Redis oauth state load failed, trying DB: %s", exc)

    row = db.query(OAuthStateDB).filter(OAuthStateDB.state == state).first()
    if not row or row.expires_at < utc_now():
        raise ValueError("Сессия OAuth истекла. Попробуйте снова.")
    return_to = row.return_to or ""
    verifier = row.pkce_verifier
    db.delete(row)
    db.commit()
    return return_to, verifier


def store_exchange_code(db: Session, user_id: int, code: str) -> None:
    expires = utc_now() + timedelta(seconds=AUTH_EXCHANGE_CODE_TTL_SEC)
    ttl = AUTH_EXCHANGE_CODE_TTL_SEC

    if redis_persistence_enabled():
        try:
            _redis_setex(f"{_EXCHANGE_PREFIX}{code}", ttl, str(user_id))
        except Exception as exc:
            logger.warning("Redis exchange code save failed, using DB only: %s", exc)

    db.query(AuthExchangeCodeDB).filter(AuthExchangeCodeDB.expires_at < utc_now()).delete()
    db.add(AuthExchangeCodeDB(code=code, user_id=user_id, expires_at=expires))
    db.commit()


def pop_exchange_user_id(db: Session, exchange_code: str) -> int:
    if redis_persistence_enabled():
        key = f"{_EXCHANGE_PREFIX}{exchange_code}"
        try:
            raw = _redis().get(key)
            if raw:
                _redis().delete(key)
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            if raw:
                return int(raw)
        except Exception as exc:
            logger.warning("Redis exchange code load failed, trying DB: %s", exc)

    row = (
        db.query(AuthExchangeCodeDB)
        .filter(AuthExchangeCodeDB.code == exchange_code)
        .first()
    )
    if not row or row.expires_at < utc_now():
        raise ValueError("Код входа недействителен или истёк")
    user_id = row.user_id
    db.delete(row)
    db.commit()
    return user_id
