"""Polza.ai: автовыдача ключей (MCP), inference proxy, баланс и лимиты."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import secrets
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.config import (
    POLZA_APP_NAME,
    POLZA_AUTH_BASE,
    POLZA_BACKEND_API_KEY,
    POLZA_BASE_URL,
    POLZA_MCP_TOKEN,
    POLZA_OAUTH_CALLBACK_URL,
)
from app.database import OAuthPkceSessionDB, UserDB
from app.services.credentials_vault import decrypt_secret, encrypt_secret
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.polza_mcp import (
    PolzaMcpError,
    delete_polza_keys_by_name,
    mcp_create_api_key,
    mcp_delete_api_key,
    mcp_quarantine_api_key,
    mcp_update_api_key_monthly_limit,
)
from app.tiers import normalize_tier, tier_monthly_cap, tier_requires_payment
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

PKCE_TTL_MINUTES = 10
_provision_locks: dict[int, asyncio.Lock] = {}


def _provision_lock_for(user_id: int) -> asyncio.Lock:
    if user_id not in _provision_locks:
        _provision_locks[user_id] = asyncio.Lock()
    return _provision_locks[user_id]


class PolzaError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class PolzaService:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or POLZA_BASE_URL).rstrip("/")

    def _api_headers(self, api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def chat_completions(
        self, api_key: str, payload: dict[str, Any], *, timeout: float = 120.0
    ) -> httpx.Response:
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._api_headers(api_key),
                json=payload,
            )

    async def get_balance(self, api_key: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self.base_url}/balance",
                headers=self._api_headers(api_key),
            )
        if response.status_code != 200:
            raise PolzaError(response.text[:300], response.status_code)
        return response.json()

    async def list_models(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{self.base_url}/models")
        if response.status_code != 200:
            raise PolzaError(response.text[:300], response.status_code)
        return response.json()

    async def verify_backend_key(self) -> dict[str, Any]:
        key = (POLZA_BACKEND_API_KEY or "").strip()
        if not key:
            return {"ok": False, "message": "POLZA_BACKEND_API_KEY не задан"}
        try:
            bal = await self.get_balance(key)
            amount = float(bal.get("amount") or 0)
            return {"ok": True, "message": "Backend-ключ Polza OK", "balance_rub": amount}
        except PolzaError as exc:
            return {"ok": False, "message": str(exc)}


def generate_pkce_pair() -> tuple[str, str]:
    code_verifier = secrets.token_urlsafe(32)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def resolve_oauth_callback_url(request_base: str | None = None) -> str:
    if POLZA_OAUTH_CALLBACK_URL:
        return POLZA_OAUTH_CALLBACK_URL.rstrip("/")
    if request_base:
        return f"{request_base.rstrip('/')}/v1/auth/polza/callback"
    return "http://127.0.0.1:8790/v1/auth/polza/callback"


def get_user_polza_key(user: UserDB) -> str | None:
    enc = getattr(user, "polza_api_key_encrypted", None)
    if enc:
        return decrypt_secret(enc)
    return None


def set_user_polza_key(
    db: Session,
    user: UserDB,
    api_key: str,
    *,
    polza_key_id: str | None = None,
    polza_user_id: str | None = None,
) -> None:
    user.polza_api_key_encrypted = encrypt_secret(api_key.strip())
    if polza_key_id:
        user.polza_key_id = str(polza_key_id)
    if polza_user_id:
        user.polza_user_id = polza_user_id
    user.polza_key_updated_at = utc_now()
    user.polza_connect_required = 0
    db.commit()
    db.refresh(user)


def clear_user_polza_key(db: Session, user: UserDB) -> None:
    user.polza_api_key_encrypted = None
    user.polza_user_id = None
    user.polza_key_id = None
    user.polza_key_updated_at = None
    db.commit()
    db.refresh(user)


def _extract_created_key_payload(raw: Any) -> tuple[str | None, str | None]:
    if isinstance(raw, str) and raw.strip().startswith("pza_"):
        return raw.strip(), None
    if not isinstance(raw, dict):
        return None, None
    key = None
    # Polza MCP create_api_key возвращает rawKey (см. Render logs)
    for field in ("rawKey", "raw_key", "key", "api_key", "secret", "token", "apiKey"):
        val = raw.get(field)
        if isinstance(val, str) and val.strip().startswith("pza_"):
            key = val.strip()
            break
    key_id = None
    for field in ("id", "key_id", "keyId", "hash"):
        val = raw.get(field)
        if val is not None and str(val).strip():
            key_id = str(val).strip()
            break
    nested = raw.get("data")
    if not key and isinstance(nested, dict):
        return _extract_created_key_payload(nested)
    return key, key_id


def polza_key_name_for_email(email: str) -> str:
    """Каноническое имя ключа Polza — один ключ на email."""
    return f"nexus-{(email or 'user').strip().lower()[:72]}"


async def delete_polza_keys_for_email(email: str) -> int:
    """Удалить все ключи Polza с каноническим именем email (очистка дубликатов)."""
    name = polza_key_name_for_email(email)
    deleted = await delete_polza_keys_by_name(name)
    if deleted:
        logger.info("Polza cleanup: removed %s key(s) for %s", deleted, email)
    return deleted


def _pool_rub_for_user(db: Session, user: UserDB) -> float:
    from app.services.invoice_pool import get_user_period_pool_usd

    rate = get_usd_rub_rate_sync()
    pool_usd = float(get_user_period_pool_usd(db, user) or tier_monthly_cap(user.subscription_tier) or 0)
    return max(1.0, usd_to_rub(pool_usd, rate))


async def provision_polza_for_user(
    user: UserDB,
    db: Session,
    *,
    pool_rub: float | None = None,
    force: bool = False,
) -> bool:
    """Создать и привязать ключ Polza к пользователю (только после оплаты / промо / админ)."""
    if not (POLZA_MCP_TOKEN or "").strip():
        logger.error("POLZA_MCP_TOKEN не задан — автовыдача ключей недоступна")
        return False

    tier = normalize_tier(getattr(user, "subscription_tier", "FREE"))
    if not tier_requires_payment(tier):
        await suspend_polza_for_user(user, db)
        return False

    if pool_rub is None:
        pool_rub = _pool_rub_for_user(db, user)
    limit_rub = max(1.0, float(pool_rub))
    if limit_rub <= 0:
        logger.error("provision_polza user=%s: pool_rub must be > 0", user.id)
        return False

    if user_has_polza_key(user) and not force:
        await sync_polza_key_limit_after_payment(user, pool_rub=limit_rub)
        db.commit()
        return True

    lock = _provision_lock_for(int(user.id))
    async with lock:
        db.refresh(user)
        if user_has_polza_key(user) and not force:
            await sync_polza_key_limit_after_payment(user, pool_rub=limit_rub)
            db.commit()
            return True

        old_key_id = getattr(user, "polza_key_id", None)
        if old_key_id:
            deleted = await mcp_delete_api_key(key_id=str(old_key_id))
            if not deleted:
                await mcp_quarantine_api_key(key_id=str(old_key_id))
            clear_user_polza_key(db, user)

        await delete_polza_keys_for_email(user.email or "")

        name = polza_key_name_for_email(user.email or "")
        try:
            raw = await mcp_create_api_key(name=name, amount_rub=limit_rub)
        except PolzaMcpError as exc:
            logger.error("provision_polza user=%s: %s", user.id, exc)
            return False

        api_key, key_id = _extract_created_key_payload(raw)
        if not api_key:
            keys_hint = list(raw.keys()) if isinstance(raw, dict) else type(raw).__name__
            logger.error("provision_polza user=%s: no pza_ key in response fields %s", user.id, keys_hint)
            if key_id:
                try:
                    await mcp_delete_api_key(key_id=str(key_id))
                    logger.info("provision_polza user=%s: rolled back orphan key_id=%s", user.id, key_id)
                except PolzaMcpError as del_exc:
                    logger.warning("provision_polza user=%s: orphan rollback failed: %s", user.id, del_exc)
            return False

        set_user_polza_key(db, user, api_key, polza_key_id=key_id)
        logger.info(
            "Polza key provisioned for user %s email=%s (tier=%s, limit=%.0f ₽)",
            user.id,
            user.email,
            tier,
            limit_rub,
        )
        return True


def user_has_polza_key(user: UserDB) -> bool:
    return bool(get_user_polza_key(user))


def require_inference_api_key(user: UserDB) -> str:
    from app.tiers import normalize_tier, tier_requires_payment

    tier = normalize_tier(getattr(user, "subscription_tier", "FREE"))
    if not tier_requires_payment(tier):
        raise PolzaError(
            "Облачный ИИ только по платной подписке. Оформите тариф Hobby или выше и оплатите счёт."
        )
    key = get_user_polza_key(user)
    if key:
        return key
    raise PolzaError(
        "Ключ облачного ИИ ещё не готов. Подождите минуту и повторите запрос или напишите в поддержку."
    )


async def suspend_polza_for_user(user: UserDB, db: Session) -> None:
    """Понижение тарифа: удалить ключ в Polza и отвязать в Nexus."""
    key_id = getattr(user, "polza_key_id", None)
    if key_id:
        deleted = await mcp_delete_api_key(key_id=str(key_id))
        if not deleted:
            await mcp_quarantine_api_key(key_id=str(key_id))
    await delete_polza_keys_for_email(user.email or "")
    clear_user_polza_key(db, user)
    user.polza_connect_required = 0
    db.commit()
    db.refresh(user)


def create_pkce_session(db: Session, user_id: int) -> tuple[str, str, str]:
    """Возвращает (state, code_verifier, authorize_url)."""
    _purge_expired_pkce(db)
    state = secrets.token_urlsafe(16)
    code_verifier, code_challenge = generate_pkce_pair()
    db.add(
        OAuthPkceSessionDB(
            state=state,
            code_verifier=code_verifier,
            user_id=user_id,
        )
    )
    db.commit()
    callback = resolve_oauth_callback_url()
    params = urlencode(
        {
            "response_type": "code",
            "callback_url": callback,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "app_name": POLZA_APP_NAME,
        }
    )
    authorize_url = f"{POLZA_AUTH_BASE}/authorize?{params}"
    return state, code_verifier, authorize_url


def _purge_expired_pkce(db: Session) -> None:
    cutoff = utc_now() - timedelta(minutes=PKCE_TTL_MINUTES)
    db.query(OAuthPkceSessionDB).filter(OAuthPkceSessionDB.created_at < cutoff).delete()
    db.commit()


async def exchange_code_for_key(
    db: Session,
    *,
    code: str,
    state: str,
    callback_url: str,
) -> tuple[str, str, int]:
    row = db.query(OAuthPkceSessionDB).filter(OAuthPkceSessionDB.state == state).first()
    if not row:
        raise PolzaError("Сессия OAuth истекла или неверный state. Повторите подключение.")
    code_verifier = row.code_verifier
    user_id = row.user_id
    db.delete(row)
    db.commit()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{POLZA_AUTH_BASE}/token",
            json={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "callback_url": callback_url,
            },
        )
    if response.status_code != 200:
        raise PolzaError(response.text[:300] or "Обмен кода на ключ не удался", response.status_code)
    data = response.json()
    api_key = (data.get("key") or "").strip()
    polza_user_id = (data.get("user_id") or "").strip()
    if not api_key:
        raise PolzaError("Polza не вернула API-ключ")
    return api_key, polza_user_id, user_id


async def sync_polza_key_limit_after_payment(
    user: UserDB,
    *,
    pool_rub: float,
) -> bool:
    """После ЮKassa: месячный лимит ключа = пул тарифа (₽)."""
    key = get_user_polza_key(user)
    if not key:
        return False
    key_id = getattr(user, "polza_key_id", None)
    prefix = key[:16] if len(key) > 8 else key
    ok = await mcp_update_api_key_monthly_limit(
        key_id=str(key_id) if key_id else None,
        api_key_prefix=None if key_id else prefix,
        amount_rub=pool_rub,
    )
    if ok:
        user.polza_connect_required = 0
    return ok


async def fetch_user_balance_rub(user: UserDB) -> float | None:
    key = get_user_polza_key(user)
    if not key:
        return None
    try:
        data = await PolzaService().get_balance(key)
        return float(data.get("amount") or 0)
    except PolzaError:
        return None
