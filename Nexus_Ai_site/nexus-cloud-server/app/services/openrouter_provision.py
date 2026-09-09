"""Per-user OpenRouter API keys for FREE tier (Management API)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.config import (
    NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD,
    OPENROUTER_FREE_KEY_LIMIT_RESET,
    openrouter_management_enabled,
)
from app.database import UserDB
from app.services.credentials_vault import decrypt_secret, encrypt_secret
from app.services.openrouter import (
    OpenRouterError,
    OpenRouterService,
    require_openrouter_api_key,
)
from app.tiers import tier_uses_openrouter_free
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

_provision_locks: dict[int, asyncio.Lock] = {}
_openrouter_mgmt = OpenRouterService()


def _provision_lock_for(user_id: int) -> asyncio.Lock:
    if user_id not in _provision_locks:
        _provision_locks[user_id] = asyncio.Lock()
    return _provision_locks[user_id]


def openrouter_key_name_for_user(user: UserDB) -> str:
    return f"nexus-free-{int(user.id)}"


def user_has_openrouter_key(user: UserDB) -> bool:
    return bool(getattr(user, "openrouter_api_key_encrypted", None))


def get_user_openrouter_key(user: UserDB) -> str | None:
    enc = getattr(user, "openrouter_api_key_encrypted", None)
    if enc:
        return decrypt_secret(enc)
    return None


def set_user_openrouter_key(
    db: Session,
    user: UserDB,
    api_key: str,
    *,
    key_hash: str | None = None,
) -> None:
    user.openrouter_api_key_encrypted = encrypt_secret(api_key.strip())
    if key_hash:
        user.openrouter_key_hash = str(key_hash)
    user.openrouter_key_created_at = utc_now()
    db.commit()
    db.refresh(user)


def clear_user_openrouter_key(db: Session, user: UserDB) -> None:
    user.openrouter_api_key_encrypted = None
    user.openrouter_key_hash = None
    user.openrouter_key_created_at = None
    db.commit()
    db.refresh(user)


def _extract_created_key(response: dict[str, Any]) -> tuple[str | None, str | None]:
    key = response.get("key")
    if isinstance(key, str) and key.strip().startswith("sk-or"):
        api_key = key.strip()
    else:
        api_key = None
    data = response.get("data")
    key_hash = None
    if isinstance(data, dict):
        for field in ("hash", "id", "key_id"):
            val = data.get(field)
            if val is not None and str(val).strip():
                key_hash = str(val).strip()
                break
    return api_key, key_hash


def _provision_body_for_user(user: UserDB) -> dict[str, Any]:
    body: dict[str, Any] = {"name": openrouter_key_name_for_user(user)}
    if NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD is not None and NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD > 0:
        body["limit"] = float(NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD)
        if OPENROUTER_FREE_KEY_LIMIT_RESET:
            body["limit_reset"] = OPENROUTER_FREE_KEY_LIMIT_RESET
    return body


async def provision_openrouter_for_user(
    user: UserDB,
    db: Session,
    *,
    force: bool = False,
) -> bool:
    """Create OpenRouter inference key and store encrypted on user."""
    if not openrouter_management_enabled():
        return False

    if user_has_openrouter_key(user) and not force:
        return True

    lock = _provision_lock_for(int(user.id))
    async with lock:
        db.refresh(user)
        if user_has_openrouter_key(user) and not force:
            return True

        key_hash = getattr(user, "openrouter_key_hash", None)
        if force and key_hash:
            try:
                await _openrouter_mgmt.delete_api_key(str(key_hash))
            except OpenRouterError as exc:
                logger.warning("openrouter revoke before reprovision user=%s: %s", user.id, exc)
            clear_user_openrouter_key(db, user)

        try:
            raw = await _openrouter_mgmt.create_api_key(_provision_body_for_user(user))
        except OpenRouterError as exc:
            logger.error("provision_openrouter user=%s: %s", user.id, exc)
            return False

        api_key, new_hash = _extract_created_key(raw)
        if not api_key:
            logger.error("provision_openrouter user=%s: missing key in response", user.id)
            if new_hash:
                try:
                    await _openrouter_mgmt.delete_api_key(new_hash)
                except OpenRouterError:
                    pass
            return False

        set_user_openrouter_key(db, user, api_key, key_hash=new_hash)
        logger.info("OpenRouter key provisioned for user %s hash=%s", user.id, new_hash)
        return True


async def delete_openrouter_key_for_user(user: UserDB, db: Session) -> None:
    """Revoke key in OpenRouter and clear local fields."""
    key_hash = getattr(user, "openrouter_key_hash", None)
    if key_hash:
        try:
            await _openrouter_mgmt.delete_api_key(str(key_hash))
        except OpenRouterError as exc:
            logger.warning("openrouter delete user=%s hash=%s: %s", user.id, key_hash, exc)
    if user_has_openrouter_key(user) or key_hash:
        clear_user_openrouter_key(db, user)


async def ensure_openrouter_key_for_user(user: UserDB, db: Session) -> str:
    """Return per-user OpenRouter key; lazy-provision on first use."""
    if not tier_uses_openrouter_free(user.subscription_tier):
        raise OpenRouterError("OpenRouter keys only for FREE tier.")

    existing = get_user_openrouter_key(user)
    if existing:
        return existing

    if openrouter_management_enabled():
        ok = await provision_openrouter_for_user(user, db, force=False)
        db.refresh(user)
        existing = get_user_openrouter_key(user)
        if ok and existing:
            return existing
        raise OpenRouterError(
            "Не удалось выдать персональный ключ OpenRouter. Попробуйте позже или оформите Hobby."
        )

    return require_openrouter_api_key()
