"""OpenAI-compatible API provider."""

from __future__ import annotations

from nexus.models.base import ModelProvider
from nexus.models.http import auth_headers, http_get, http_post, resolve_api_key
from nexus.models.types import DiscoveredModel


class OpenAICompatibleProvider(ModelProvider):
    provider_name = "openai_compatible"

    def __init__(self, provider, secrets=None):
        super().__init__(provider, secrets)
        if not provider.base_url:
            raise ValueError("base_url is required for openai_compatible/custom provider")
        self.base_url = provider.base_url.rstrip("/")

    async def check_connection(self) -> bool:
        api_key = resolve_api_key(self.provider, self.secrets)
        try:
            response = await http_get(
                f"{self.base_url}/models",
                headers=auth_headers(api_key),
            )
            return response.status_code == 200
        except Exception as e:
            return False

    async def list_models(self) -> list[DiscoveredModel]:
        api_key = resolve_api_key(self.provider, self.secrets)
        response = await http_get(
            f"{self.base_url}/models",
            headers=auth_headers(api_key),
        )
        response.raise_for_status()
        data = response.json()
        return [
            DiscoveredModel(
                id=item["id"],
                name=item.get("id", item["id"]),
                provider_id=self.provider.id,
                type=self.provider.model_type,
            )
            for item in data.get("data", [])
        ]

    async def generate(self, prompt: str) -> str:
        api_key = resolve_api_key(self.provider, self.secrets)
        target = self.entry.model
        if not target:
            raise RuntimeError("OpenAI-compatible model not configured")
        response = await http_post(
            f"{self.base_url}/chat/completions",
            {
                "model": target,
                "messages": [{"role": "user", "content": prompt}],
            },
            headers=auth_headers(api_key),
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
