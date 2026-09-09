"""Provider factory operating on normalized ModelEntry values."""

from __future__ import annotations

from nexus.models.base import BaseProvider
from nexus.models.providers.anthropic import AnthropicProvider
from nexus.models.providers.gemini import GeminiProvider
from nexus.models.providers.lmstudio import LMStudioProvider
from nexus.models.providers.ollama import OllamaProvider
from nexus.models.providers.openai import OpenAIProvider
from nexus.models.providers.openai_compatible import OpenAICompatibleProvider
from nexus.models.types import ModelEntry, ProviderAccount, ProviderEntry


_PROVIDER_MAP = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
    "lmstudio": LMStudioProvider,
    "openai_compatible": OpenAICompatibleProvider,
    "custom": OpenAICompatibleProvider,
}


def normalize_provider_entry(entry: ModelEntry | ProviderEntry | ProviderAccount) -> ModelEntry:
    if isinstance(entry, ProviderAccount):
        return entry.to_model_entry()
    if isinstance(entry, ProviderEntry):
        return ModelEntry.from_provider_entry(entry)
    if isinstance(entry, ModelEntry):
        return entry
    raise TypeError("Provider factory requires ModelEntry or ProviderEntry")


def create_provider(
    entry: ModelEntry | ProviderEntry | ProviderAccount,
    secrets=None,
) -> BaseProvider:
    model_entry = normalize_provider_entry(entry)
    provider_cls = _PROVIDER_MAP.get(model_entry.provider)
    if provider_cls is None:
        raise ValueError(f"Unknown provider: {model_entry.provider}")
    return provider_cls(model_entry, secrets=secrets)


def supported_provider_names() -> list[str]:
    return list(_PROVIDER_MAP)
