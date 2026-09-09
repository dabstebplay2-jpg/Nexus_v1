"""LM Studio local provider (OpenAI-compatible)."""

from __future__ import annotations

from nexus.models.providers.openai_compatible import OpenAICompatibleProvider


class LMStudioProvider(OpenAICompatibleProvider):
    provider_name = "lmstudio"

    def __init__(self, provider, secrets=None):
        if not provider.base_url:
            provider.base_url = "http://localhost:1234/v1"
        super().__init__(provider, secrets)
