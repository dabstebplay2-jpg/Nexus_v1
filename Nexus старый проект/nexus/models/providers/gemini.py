"""Google Gemini API provider."""

from __future__ import annotations

from nexus.models.base import ModelProvider
from nexus.models.http import http_get, http_post, resolve_api_key
from nexus.models.types import DiscoveredModel


class GeminiProvider(ModelProvider):
    provider_name = "gemini"

    def __init__(self, provider, secrets=None):
        super().__init__(provider, secrets)
        self.base_url = (
            provider.base_url or "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")

    async def check_connection(self) -> bool:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            return False
        try:
            response = await http_get(f"{self.base_url}/models?key={api_key}")
            return response.status_code == 200
        except Exception as e:
            return False

    async def list_models(self) -> list[DiscoveredModel]:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            return []
        response = await http_get(f"{self.base_url}/models?key={api_key}")
        response.raise_for_status()
        data = response.json()
        models = []
        for item in data.get("models", []):
            name = item.get("name", "")
            model_id = name.split("/")[-1] if "/" in name else name
            models.append(
                DiscoveredModel(
                    id=model_id,
                    name=item.get("displayName", model_id),
                    provider_id=self.provider.id,
                    type=self.provider.model_type,
                )
            )
        return models

    async def generate(self, prompt: str) -> str:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            raise RuntimeError("Gemini API key not configured")
        target = self.entry.model
        if not target:
            raise RuntimeError("Gemini model not configured")

        url = f"{self.base_url}/models/{target}:generateContent?key={api_key}"
        response = await http_post(
            url,
            {"contents": [{"parts": [{"text": prompt}]}]},
        )
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
