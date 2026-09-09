"""OAuth start/callback for MVP connectors."""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from app.config import (
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI,
    GOOGLE_CONNECTOR_CLIENT_ID,
    GOOGLE_CONNECTOR_CLIENT_SECRET,
    GOOGLE_CONNECTOR_REDIRECT_URI,
    VERCEL_CLIENT_ID,
    VERCEL_CLIENT_SECRET,
    VERCEL_REDIRECT_URI,
    github_oauth_configured,
    google_connector_oauth_configured,
    vercel_oauth_configured,
)
from app.services.connectors.oauth_state import create_connector_oauth_state
from app.services.connectors.store import upsert_connection
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

_GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
_GITHUB_AUTH = "https://github.com/login/oauth/authorize"
_GITHUB_TOKEN = "https://github.com/login/oauth/access_token"
_VERCEL_AUTH = "https://vercel.com/oauth/authorize"
_VERCEL_TOKEN = "https://api.vercel.com/v2/oauth/access_token"

_GOOGLE_CONNECTOR_SCOPES = (
    "openid email profile "
    "https://www.googleapis.com/auth/gmail.readonly "
    "https://www.googleapis.com/auth/calendar.readonly"
)


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def connector_oauth_ready(connector_id: str) -> bool:
    """True if server OAuth env is set for this connector (discord uses webhook)."""
    if connector_id == "discord":
        return True
    return _oauth_configured(connector_id)


def _oauth_configured(connector_id: str) -> bool:
    if connector_id == "google_workspace":
        return google_connector_oauth_configured()
    if connector_id == "github":
        return github_oauth_configured()
    if connector_id == "vercel":
        return vercel_oauth_configured()
    return False


def create_connect_url(
    db: Session,
    *,
    user_id: int,
    connector_id: str,
    return_to: str | None,
) -> str:
    if connector_id == "discord":
        raise ValueError("Discord подключается через URL вебхука (PATCH /connectors/discord)")
    if not _oauth_configured(connector_id):
        raise RuntimeError(f"OAuth для {connector_id} не настроен на сервере")

    verifier, challenge = _pkce_pair()
    state = create_connector_oauth_state(
        db,
        user_id=user_id,
        connector_id=connector_id,
        pkce_verifier=verifier,
        return_to=return_to,
    )

    if connector_id == "google_workspace":
        params = {
            "client_id": GOOGLE_CONNECTOR_CLIENT_ID,
            "redirect_uri": GOOGLE_CONNECTOR_REDIRECT_URI,
            "response_type": "code",
            "scope": _GOOGLE_CONNECTOR_SCOPES,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"{_GOOGLE_AUTH}?{urlencode(params)}"

    if connector_id == "github":
        params = {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": GITHUB_REDIRECT_URI,
            "scope": "repo read:user",
            "state": state,
        }
        return f"{_GITHUB_AUTH}?{urlencode(params)}"

    if connector_id == "vercel":
        params = {
            "client_id": VERCEL_CLIENT_ID,
            "redirect_uri": VERCEL_REDIRECT_URI,
            "state": state,
        }
        return f"{_VERCEL_AUTH}?{urlencode(params)}"

    raise ValueError("Unknown connector")


async def _exchange_google(code: str, verifier: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            _GOOGLE_TOKEN,
            data={
                "client_id": GOOGLE_CONNECTOR_CLIENT_ID,
                "client_secret": GOOGLE_CONNECTOR_CLIENT_SECRET,
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": GOOGLE_CONNECTOR_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    if r.status_code >= 400:
        raise ValueError(f"Google token error: {r.text[:300]}")
    return r.json()


async def _exchange_github(code: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            _GITHUB_TOKEN,
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
        )
    if r.status_code >= 400:
        raise ValueError(f"GitHub token error: {r.text[:300]}")
    return r.json()


async def _exchange_vercel(code: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            _VERCEL_TOKEN,
            data={
                "client_id": VERCEL_CLIENT_ID,
                "client_secret": VERCEL_CLIENT_SECRET,
                "code": code,
                "redirect_uri": VERCEL_REDIRECT_URI,
            },
        )
    if r.status_code >= 400:
        raise ValueError(f"Vercel token error: {r.text[:300]}")
    return r.json()


async def _github_user_label(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
    if r.status_code >= 400:
        return "GitHub"
    data = r.json()
    return data.get("login") or data.get("email") or "GitHub"


async def handle_oauth_callback(
    db: Session,
    *,
    connector_id: str,
    code: str,
    verifier: str,
    user_id: int,
) -> str:
    """Persist tokens; return account_label."""
    if connector_id == "google_workspace":
        tokens = await _exchange_google(code, verifier)
        creds = {
            "access_token": tokens.get("access_token"),
            "refresh_token": tokens.get("refresh_token"),
            "token_type": tokens.get("token_type", "Bearer"),
        }
        expires_at = None
        if tokens.get("expires_in"):
            expires_at = utc_now() + timedelta(seconds=int(tokens["expires_in"]))
        label = "Google"
        async with httpx.AsyncClient(timeout=15.0) as client:
            ui = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {creds['access_token']}"},
            )
            if ui.status_code < 400:
                label = ui.json().get("email") or label
        upsert_connection(
            db,
            user_id=user_id,
            connector_id=connector_id,
            credentials=creds,
            account_label=label,
            scopes=_GOOGLE_CONNECTOR_SCOPES,
            expires_at=expires_at,
        )
        return label

    if connector_id == "github":
        tokens = await _exchange_github(code)
        access = tokens.get("access_token")
        if not access:
            raise ValueError("GitHub не вернул access_token")
        label = await _github_user_label(access)
        upsert_connection(
            db,
            user_id=user_id,
            connector_id=connector_id,
            credentials={"access_token": access, "token_type": "Bearer"},
            account_label=label,
            scopes="repo read:user",
        )
        return label

    if connector_id == "vercel":
        tokens = await _exchange_vercel(code)
        access = tokens.get("access_token") or tokens.get("token")
        if not access:
            raise ValueError("Vercel не вернул access_token")
        upsert_connection(
            db,
            user_id=user_id,
            connector_id=connector_id,
            credentials={"access_token": access, "token_type": "Bearer"},
            account_label="Vercel",
            scopes="",
        )
        return "Vercel"

    raise ValueError("Unknown connector")
