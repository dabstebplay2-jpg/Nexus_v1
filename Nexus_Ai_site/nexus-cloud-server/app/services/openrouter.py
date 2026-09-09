"""OpenRouter.ai: inference для тарифа FREE (платформенный ключ)."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_APP_TITLE,
    OPENROUTER_BASE_URL,
    OPENROUTER_HTTP_REFERER,
    OPENROUTER_MANAGEMENT_API_KEY,
    openrouter_free_tier_enabled,
    openrouter_management_enabled,
)


class OpenRouterError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class OpenRouterService:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.base_url = (base_url or OPENROUTER_BASE_URL).rstrip("/")
        self.api_key = (api_key or OPENROUTER_API_KEY).strip()

    def configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self, api_key: str | None = None) -> dict[str, str]:
        key = (api_key or self.api_key).strip()
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        if OPENROUTER_HTTP_REFERER:
            headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER
        if OPENROUTER_APP_TITLE:
            headers["X-Title"] = OPENROUTER_APP_TITLE
        return headers

    async def chat_completions(
        self, payload: dict[str, Any], *, timeout: float = 120.0, api_key: str | None = None
    ) -> httpx.Response:
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(api_key),
                json=payload,
            )

    async def list_models(self, *, timeout: float = 45.0) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{self.base_url}/models",
                headers=self._headers(),
            )
        if response.status_code != 200:
            raise OpenRouterError(response.text[:300], response.status_code)
        return response.json()

    def _management_headers(self) -> dict[str, str]:
        key = (OPENROUTER_MANAGEMENT_API_KEY or "").strip()
        if not key:
            raise OpenRouterError("OPENROUTER_MANAGEMENT_API_KEY не задан.")
        return {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    async def create_api_key(self, body: dict[str, Any], *, timeout: float = 30.0) -> dict[str, Any]:
        if not openrouter_management_enabled():
            raise OpenRouterError("Management API OpenRouter не настроен.")
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/keys",
                headers=self._management_headers(),
                json=body,
            )
        if response.status_code in (200, 201):
            data = response.json()
            return data if isinstance(data, dict) else {}
        raise OpenRouterError(response.text[:300], response.status_code)

    async def verify_management_key(self, *, timeout: float = 30.0) -> dict[str, Any]:
        """Проверка Management API: GET /keys."""
        if not openrouter_management_enabled():
            raise OpenRouterError("OPENROUTER_MANAGEMENT_API_KEY не задан.")
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{self.base_url}/keys",
                headers=self._management_headers(),
            )
        if response.status_code != 200:
            raise OpenRouterError(response.text[:300], response.status_code)
        data = response.json()
        return {"ok": True, "message": "Management API OpenRouter работает", "raw": data}

    async def delete_api_key(self, key_hash: str, *, timeout: float = 30.0) -> None:
        if not openrouter_management_enabled():
            return
        h = (key_hash or "").strip()
        if not h:
            return
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.delete(
                f"{self.base_url}/keys/{h}",
                headers=self._management_headers(),
            )
        if response.status_code in (200, 204, 404):
            return
        raise OpenRouterError(response.text[:300], response.status_code)


def require_openrouter_api_key() -> str:
    if not openrouter_free_tier_enabled():
        raise OpenRouterError(
            "Бесплатный ИИ временно недоступен. Оформите тариф Hobby или выше."
        )
    return OPENROUTER_API_KEY
