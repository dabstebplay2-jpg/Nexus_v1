"""Одноразовые токены привязки Telegram ↔ аккаунт Nexus."""

from __future__ import annotations

import json
import logging
import secrets
import time

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import (
    TELEGRAM_BOT_USERNAME,
    TELEGRAM_LINK_TTL_SEC,
    redis_persistence_enabled,
)
from app.database import UserDB
from app.services.auth_session import _add_auth_method
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

TG_EMAIL_SUFFIX = "@tg.nexus"


def is_tg_shadow_email(email: str | None) -> bool:
    return (email or "").strip().lower().endswith(TG_EMAIL_SUFFIX)


def is_reclaimable_tg_shadow(user: UserDB) -> bool:
    """Временный TG-only аккаунт (ошибочно создан через /login вместо привязки)."""
    if not is_tg_shadow_email(user.email):
        return False
    if not user.telegram_id:
        return False
    tier = (user.subscription_tier or "FREE").strip().upper()
    if tier not in ("FREE", ""):
        return False
    if float(user.balance or 0) > 0.01:
        return False
    return True


def release_telegram_binding(db: Session, user: UserDB) -> tuple[int, str | None]:
    tid = int(user.telegram_id)
    username = user.telegram_username
    user.telegram_id = None
    user.telegram_username = None
    db.flush()
    return tid, username

_LINK_PREFIX = "nexus:v1:tg_link:"
_mem_links: dict[str, tuple[int, float]] = {}


def _redis():
    from app.services.redis_sync import _redis_client

    return _redis_client()


def _redis_setex(key: str, ttl: int, value: str) -> None:
    client = _redis()
    try:
        client.setex(key, ttl, value)
    except TypeError:
        client.set(key, value, ex=ttl)


def _prune_mem_links() -> None:
    now = time.time()
    expired = [k for k, (_, exp) in _mem_links.items() if exp <= now]
    for k in expired:
        _mem_links.pop(k, None)


def create_link_token(user_id: int) -> tuple[str, int]:
    """Возвращает (token, expires_in_sec)."""
    token = secrets.token_urlsafe(24)[:32]
    ttl = max(60, TELEGRAM_LINK_TTL_SEC)
    payload = json.dumps({"user_id": user_id, "created_at": utc_now().isoformat()})

    if redis_persistence_enabled():
        try:
            _redis_setex(f"{_LINK_PREFIX}{token}", ttl, payload)
        except Exception as exc:
            logger.warning("Redis tg link save failed, using memory: %s", exc)
            _prune_mem_links()
            _mem_links[token] = (user_id, time.time() + ttl)
    else:
        _prune_mem_links()
        _mem_links[token] = (user_id, time.time() + ttl)

    return token, ttl


def build_deep_link(token: str) -> str:
    username = (TELEGRAM_BOT_USERNAME or "NexusAiBot").lstrip("@")
    return f"https://t.me/{username}?start={token}"


def _pop_link_user_id(token: str) -> int | None:
    token = (token or "").strip()
    if not token:
        return None

    if redis_persistence_enabled():
        key = f"{_LINK_PREFIX}{token}"
        try:
            raw = _redis().get(key)
            if raw:
                _redis().delete(key)
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            if raw:
                data = json.loads(raw)
                return int(data["user_id"])
        except Exception as exc:
            logger.warning("Redis tg link load failed: %s", exc)

    entry = _mem_links.pop(token, None)
    if entry and entry[1] > time.time():
        return entry[0]
    return None


def mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked = local[0] + "***"
    else:
        masked = local[:2] + "***"
    return f"{masked}@{domain}"


def link_telegram_account(
    db: Session,
    *,
    token: str,
    telegram_id: int,
    telegram_username: str | None,
) -> UserDB:
    user_id = _pop_link_user_id(token)
    if not user_id:
        raise ValueError("Ссылка привязки недействительна или истекла. Получите новую в настройках на сайте.")

    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise ValueError("Аккаунт не найден.")

    existing = db.query(UserDB).filter(UserDB.telegram_id == telegram_id).first()
    if existing and existing.id != user.id:
        if is_reclaimable_tg_shadow(existing):
            release_telegram_binding(db, existing)
        else:
            raise ValueError(
                "Этот Telegram уже привязан к другому аккаунту. "
                "Если вы входили через /login в боте — войдите на сайте по email и привяжите Telegram в Настройках."
            )

    if user.telegram_id and int(user.telegram_id) != int(telegram_id):
        raise ValueError("К аккаунту уже привязан другой Telegram. Отвязка — в настройках на сайте (скоро).")

    user.telegram_id = int(telegram_id)
    user.telegram_username = (telegram_username or "").strip().lstrip("@") or None
    _add_auth_method(user, "telegram")
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Не удалось привязать Telegram. Попробуйте снова.") from exc

    return user


def attach_telegram_to_user(
    db: Session,
    *,
    target: UserDB,
    telegram_id: int,
    telegram_username: str | None,
) -> UserDB:
    """Привязать telegram_id к аккаунту, отобрав у reclaimable shadow при необходимости."""
    tid = int(telegram_id)
    existing = db.query(UserDB).filter(UserDB.telegram_id == tid).first()
    if existing and existing.id != target.id:
        if is_reclaimable_tg_shadow(existing):
            release_telegram_binding(db, existing)
        else:
            raise ValueError("Этот Telegram уже привязан к другому аккаунту.")

    if target.telegram_id and int(target.telegram_id) != tid:
        raise ValueError("К аккаунту уже привязан другой Telegram.")

    target.telegram_id = tid
    target.telegram_username = (telegram_username or "").strip().lstrip("@") or None
    _add_auth_method(target, "telegram")
    db.commit()
    db.refresh(target)
    return target


def get_user_by_telegram_id(db: Session, telegram_id: int) -> UserDB | None:
    return db.query(UserDB).filter(UserDB.telegram_id == int(telegram_id)).first()
