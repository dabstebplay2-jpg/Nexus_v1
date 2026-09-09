"""Google OAuth 2.0 with PKCE and id_token verification."""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import time
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from jwt import PyJWKSet
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import (
    AUTH_EXCHANGE_CODE_TTL_SEC,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    OAUTH_STATE_TTL_SEC,
    SECRET_KEY,
    google_oauth_configured,
    redis_persistence_enabled,
)
from app.database import UserDB
from app.services.auth_session import _add_auth_method, issue_tokens_and_setup
from app.services.oauth_redirect import normalize_return_to
from app.services.oauth_state_store import pop_exchange_user_id, pop_oauth_state
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_JWKS_CACHE: dict | None = None
_JWKS_CACHE_AT: float = 0.0
_JWKS_CACHE_TTL_SEC = 3600


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _require_secret() -> str:
    if not SECRET_KEY:
        raise RuntimeError("NEXUS_CLOUD_SECRET_KEY не задан на сервере")
    return SECRET_KEY


def _encode_oauth_state(verifier: str, return_to: str | None) -> str:
    """Signed state — works on any Render instance without Redis."""
    exp = utc_now() + timedelta(seconds=OAUTH_STATE_TTL_SEC)
    return jwt.encode(
        {"typ": "oauth_state", "pkce": verifier, "rt": return_to or "", "exp": exp},
        _require_secret(),
        algorithm="HS256",
    )


def _decode_oauth_state_jwt(state: str) -> tuple[str, str]:
    data = jwt.decode(state, _require_secret(), algorithms=["HS256"])
    if data.get("typ") != "oauth_state":
        raise jwt.InvalidTokenError("wrong typ")
    return data.get("rt") or "", data["pkce"]


def _resolve_oauth_state(db: Session, state: str) -> tuple[str, str]:
    """JWT state (preferred) or legacy Redis/DB opaque state."""
    if state.count(".") == 2:
        try:
            return _decode_oauth_state_jwt(state)
        except jwt.PyJWTError as exc:
            logger.warning("OAuth JWT state invalid: %s", exc)
    return pop_oauth_state(db, state)


def _issue_exchange_jwt(user_id: int, email: str) -> str:
    exp = utc_now() + timedelta(seconds=AUTH_EXCHANGE_CODE_TTL_SEC)
    return jwt.encode(
        {"typ": "oauth_ex", "uid": user_id, "email": email.strip().lower(), "exp": exp},
        _require_secret(),
        algorithm="HS256",
    )


def _resolve_exchange_claims(db: Session, exchange_code: str) -> tuple[int | None, str | None]:
    """JWT exchange (uid + email) or legacy opaque code → (user_id, email)."""
    if exchange_code.count(".") == 2:
        try:
            data = jwt.decode(exchange_code, _require_secret(), algorithms=["HS256"])
            if data.get("typ") == "oauth_ex":
                uid_raw = data.get("uid")
                email = (data.get("email") or "").strip().lower() or None
                return (int(uid_raw) if uid_raw is not None else None, email)
        except (jwt.PyJWTError, TypeError, ValueError) as exc:
            logger.warning("OAuth exchange JWT invalid: %s", exc)
    try:
        uid = pop_exchange_user_id(db, exchange_code)
    except ValueError:
        return None, None
    row = db.query(UserDB).filter(UserDB.id == uid).first()
    return uid, (row.email.strip().lower() if row and row.email else None)


def create_oauth_start(db: Session, return_to: str | None, login_hint: str | None = None) -> str:
    if not google_oauth_configured():
        raise RuntimeError("Google OAuth не настроен на сервере")

    verifier, challenge = _pkce_pair()
    safe_return = normalize_return_to(return_to)
    state = _encode_oauth_state(verifier, safe_return)

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    if login_hint and "@" in login_hint:
        params["login_hint"] = login_hint
    return f"{_GOOGLE_AUTH_URL}?{urlencode(params)}"


def _audience_matches(aud: Any) -> bool:
    if aud is None:
        return False
    if isinstance(aud, (list, tuple)):
        return GOOGLE_CLIENT_ID in aud
    return str(aud) == GOOGLE_CLIENT_ID


def _email_verified_flag(value: Any) -> bool:
    return value in (True, "true", "1", 1)


async def _load_google_jwks() -> dict:
    global _JWKS_CACHE, _JWKS_CACHE_AT
    now = time.time()
    if _JWKS_CACHE and now - _JWKS_CACHE_AT < _JWKS_CACHE_TTL_SEC:
        return _JWKS_CACHE
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(_GOOGLE_JWKS_URL)
    r.raise_for_status()
    _JWKS_CACHE = r.json()
    _JWKS_CACHE_AT = now
    return _JWKS_CACHE


async def _verify_id_token_jwks(id_token: str) -> dict:
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    if not kid:
        raise ValueError("id_token без kid")
    jwks = await _load_google_jwks()
    try:
        signing = PyJWKSet.from_dict(jwks)[kid]
    except KeyError as exc:
        raise ValueError(f"нет ключа JWKS для kid={kid}") from exc
    return jwt.decode(
        id_token,
        signing.key,
        algorithms=["RS256"],
        audience=GOOGLE_CLIENT_ID,
        issuer=["https://accounts.google.com", "accounts.google.com"],
        leeway=120,
    )


async def _verify_id_token_tokeninfo(id_token: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(_GOOGLE_TOKENINFO_URL, params={"id_token": id_token})
    if r.status_code >= 400:
        raise ValueError(f"tokeninfo HTTP {r.status_code}")
    data = r.json()
    if data.get("error"):
        raise ValueError(str(data.get("error_description") or data.get("error")))
    if not _audience_matches(data.get("aud")):
        logger.error(
            "Google id_token aud mismatch: token=%r server=%r",
            data.get("aud"),
            GOOGLE_CLIENT_ID,
        )
        raise ValueError(
            "invalid_client: GOOGLE_CLIENT_ID на Render не совпадает с OAuth-клиентом в Google Console"
        )
    return {
        "sub": data.get("sub"),
        "email": data.get("email"),
        "email_verified": _email_verified_flag(data.get("email_verified")),
        "aud": data.get("aud"),
    }


async def _verify_id_token(id_token: str) -> dict:
    """JWKS (local) then Google tokeninfo — Render иногда не успевает PyJWKClient."""
    last_exc: Exception | None = None
    for name, fn in (("jwks", _verify_id_token_jwks), ("tokeninfo", _verify_id_token_tokeninfo)):
        try:
            claims = await fn(id_token)
            if not _email_verified_flag(claims.get("email_verified")):
                raise ValueError("Email Google не подтверждён")
            return claims
        except Exception as exc:
            last_exc = exc
            logger.warning("Google id_token via %s failed: %s", name, exc)
    try:
        unverified = jwt.decode(id_token, options={"verify_signature": False})
        logger.warning(
            "Google id_token verify failed; aud=%r iss=%r expected_aud_prefix=%r",
            unverified.get("aud"),
            unverified.get("iss"),
            (GOOGLE_CLIENT_ID or "")[:24],
        )
    except Exception:
        pass
    if last_exc and "invalid_client" in str(last_exc).lower():
        raise ValueError(str(last_exc)) from last_exc
    raise ValueError("Не удалось проверить токен Google") from last_exc


async def _exchange_code(code: str, verifier: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                _GOOGLE_TOKEN_URL,
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": code,
                    "code_verifier": verifier,
                    "redirect_uri": GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
    except httpx.HTTPError as exc:
        logger.error("Google token HTTP error: %s", exc)
        raise ValueError("Не удалось связаться с Google") from exc
    if r.status_code >= 400:
        logger.error("Google token exchange failed: %s", r.text[:500])
        try:
            err_body = r.json()
            g_err = (err_body.get("error") or "").strip()
            if g_err == "redirect_uri_mismatch":
                raise ValueError(
                    "redirect_uri_mismatch: проверьте GOOGLE_REDIRECT_URI на Render и в Google Console"
                )
            if g_err == "invalid_client":
                raise ValueError("invalid_client: проверьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на Render")
        except ValueError:
            raise
        except Exception:
            pass
        raise ValueError("Не удалось войти через Google (ошибка обмена кода)")
    return r.json()


async def find_or_create_google_user(
    db: Session, *, google_sub: str, email: str, email_verified: bool
) -> UserDB:
    email = email.strip().lower()
    by_sub = db.query(UserDB).filter(UserDB.google_sub == google_sub).first()
    if by_sub:
        return by_sub

    by_email = db.query(UserDB).filter(UserDB.email == email).first()
    if by_email:
        if by_email.google_sub and by_email.google_sub != google_sub:
            if email_verified:
                logger.warning(
                    "Relinking google_sub for user_id=%s (verified Google id_token for same email)",
                    by_email.id,
                )
            else:
                raise ValueError("Этот email уже привязан к другому Google-аккаунту")
        by_email.google_sub = google_sub
        _add_auth_method(by_email, "google")
        if email_verified and not by_email.email_verified_at:
            by_email.email_verified_at = utc_now()
        db.commit()
        db.refresh(by_email)
        return by_email

    user = UserDB(
        email=email,
        hashed_password="",
        google_sub=google_sub,
        subscription_tier="FREE",
        balance=0.0,
        refresh_token="ref_" + str(uuid.uuid4()),
        email_verified_at=utc_now() if email_verified else None,
        auth_methods="google",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Не удалось создать аккаунт. Попробуйте войти по email.") from exc
    db.refresh(user)
    return user


async def handle_google_callback(db: Session, code: str, state: str) -> tuple[str, str]:
    """Returns (frontend_return_to, exchange_code)."""
    return_to, verifier = _resolve_oauth_state(db, state)

    tokens = await _exchange_code(code, verifier)
    id_token = tokens.get("id_token")
    if not id_token:
        raise ValueError("Google не вернул id_token")

    claims = await _verify_id_token(id_token)

    email = (claims.get("email") or "").strip().lower()
    google_sub = claims.get("sub") or ""
    if not email or not google_sub:
        raise ValueError("Недостаточно данных от Google")

    user = await find_or_create_google_user(
        db, google_sub=google_sub, email=email, email_verified=True
    )
    if redis_persistence_enabled():
        from app.services.redis_sync import persist_snapshot_to_redis

        try:
            persist_snapshot_to_redis(db)
        except Exception:
            logger.exception("Redis persist before OAuth redirect failed (exchange uses email fallback)")

    exchange = _issue_exchange_jwt(user.id, user.email)
    return return_to, exchange


async def exchange_auth_code(db: Session, exchange_code: str) -> dict:
    if redis_persistence_enabled():
        from app.services.redis_sync import hydrate_from_redis

        hydrate_from_redis()

    user_id, email = _resolve_exchange_claims(db, exchange_code)
    user = None
    if user_id is not None:
        user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user and email:
        user = db.query(UserDB).filter(UserDB.email == email).first()
    if not user:
        raise ValueError("Пользователь не найден. Повторите вход через Google.")
    return await issue_tokens_and_setup(db, user, mark_email_verified=True)
