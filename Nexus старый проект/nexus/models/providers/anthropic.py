"""Anthropic API provider."""

from __future__ import annotations

from nexus.models.base import ModelProvider
from nexus.models.http import auth_headers, http_get, http_post, resolve_api_key
from nexus.models.types import DiscoveredModel


class AnthropicProvider(ModelProvider):
    provider_name = "anthropic"

    def __init__(self, provider, secrets=None):
        super().__init__(provider, secrets)
        self.base_url = (provider.base_url or "https://api.anthropic.com/v1").rstrip("/")

    async def check_connection(self) -> bool:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            return False
        try:
            response = await http_get(
                f"{self.base_url}/models",
                headers={
                    **auth_headers(api_key),
                    "anthropic-version": "2023-06-01",
                },
            )
            return response.status_code == 200
        except Exception as e:
            return False

    async def list_models(self) -> list[DiscoveredModel]:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            return []
        response = await http_get(
            f"{self.base_url}/models",
            headers={
                **auth_headers(api_key),
                "anthropic-version": "2023-06-01",
            },
        )
        response.raise_for_status()
        data = response.json()
        return [
            DiscoveredModel(
                id=item["id"],
                name=item.get("display_name", item["id"]),
                provider_id=self.provider.id,
                type=self.provider.model_type,
            )
            for item in data.get("data", [])
        ]

    async def generate(self, prompt: str) -> str:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            raise RuntimeError("Anthropic API key not configured")
        target = self.entry.model
        if not target:
            raise RuntimeError("Anthropic model not configured")

        response = await http_post(
            f"{self.base_url}/messages",
            {
                "model": target,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            headers={
                **auth_headers(api_key),
                "anthropic-version": "2023-06-01",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]
