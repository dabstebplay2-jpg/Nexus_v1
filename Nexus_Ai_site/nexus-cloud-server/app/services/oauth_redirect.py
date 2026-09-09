"""Validate OAuth return_to URLs against an allowlist."""

from __future__ import annotations

from urllib.parse import urlparse

from app.config import NEXUS_FRONTEND_URL, oauth_allowed_redirect_bases


def normalize_return_to(return_to: str | None) -> str | None:
    """Return sanitized base URL or None if not allowed."""
    raw = (return_to or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        return None
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return None
    origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    allowed = oauth_allowed_redirect_bases()
    if origin not in allowed:
        return None
    return origin


def safe_oauth_redirect_base(return_to: str | None) -> str:
    return normalize_return_to(return_to) or NEXUS_FRONTEND_URL.rstrip("/")
