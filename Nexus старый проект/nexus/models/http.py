"""HTTP helpers for model providers."""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx


def _trust_environment_proxy(url: str) -> bool:
    """Keep loopback model servers out of system-wide HTTP proxies."""
    host = (urlsplit(url).hostname or "").lower()
    return host not in {"localhost", "127.0.0.1", "::1"}


def resolve_api_key(provider, secrets=None) -> str | None:

    api_key_ref = getattr(provider, "api_key_ref", None)

    if api_key_ref and secrets:
        return secrets.get(api_key_ref)


    api_key = getattr(provider, "api_key", None)

    if api_key:
        return api_key


    api_key_env = getattr(provider, "api_key_env", None)

    if api_key_env:
        import os
        return os.getenv(api_key_env)


    return None


def auth_headers(api_key: str | None, extra: dict | None = None) -> dict[str, str]:
    headers = dict(extra or {})
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


async def http_get(url: str, headers: dict | None = None, timeout: float = 10.0) -> httpx.Response:
    async with httpx.AsyncClient(
        timeout=timeout,
        trust_env=_trust_environment_proxy(url),
    ) as client:
        return await client.get(url, headers=headers or {})


async def http_post(
    url: str,
    payload: dict,
    headers: dict | None = None,
    timeout: float = 60.0,
) -> httpx.Response:
    async with httpx.AsyncClient(
        timeout=timeout,
        trust_env=_trust_environment_proxy(url),
    ) as client:
        return await client.post(url, json=payload, headers=headers or {})
