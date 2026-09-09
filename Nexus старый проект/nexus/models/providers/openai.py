"""OpenAI API provider."""

from __future__ import annotations

from nexus.models.base import ModelProvider
from nexus.models.http import auth_headers, http_get, http_post, resolve_api_key
from nexus.models.types import DiscoveredModel


class OpenAIProvider(ModelProvider):
    provider_name = "openai"

    def __init__(self, provider, secrets=None):
        super().__init__(provider, secrets)
        self.base_url = (provider.base_url or "https://api.openai.com/v1").rstrip("/")

    async def check_connection(self) -> bool:
        api_key = resolve_api_key(self.provider, self.secrets)
        if not api_key:
            return False
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
        if not api_key:
            return []
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
        if not api_key:
            raise RuntimeError("OpenAI API key not configured")
        target = self.entry.model
        if not target:
            raise RuntimeError("OpenAI model not configured")

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


    async def diagnose(self):

        import os

        key = os.getenv(
            "OPENAI_API_KEY"
        )

        if not key:

            return {
                "ok": False,
                "provider": "openai",
                "error": "OPENAI_API_KEY missing"
            }


        try:

            response = await http_get(
                "https://api.openai.com/v1/models",
                headers={
                    "Authorization":
                    f"Bearer {key}"
                }
            )


            if response.status_code != 200:

                return {
                    "ok": False,
                    "status": response.status_code,
                    "error": response.text
                }


            return {
                "ok": True,
                "provider": "openai"
            }


        except Exception as e:

            return {
                "ok": False,
                "error": str(e),
                "exception": type(e).__name__
            }

