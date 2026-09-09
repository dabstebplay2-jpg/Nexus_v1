import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.models.base import BaseProvider
from nexus.models.factory import create_provider
from nexus.models.types import ModelEntry, ProviderEntry, ProviderType


def _entry(provider: str, model_type: str = "cloud", **kwargs) -> ModelEntry:
    return ModelEntry(
        id="test",
        name="Test",
        provider=provider,
        model="test-model",
        type=model_type,
        **kwargs,
    )


def test_provider_factory():
    entries = [
        _entry("openai"),
        _entry("anthropic"),
        _entry("gemini"),
        _entry("ollama", model_type="local"),
        _entry("lmstudio", model_type="local"),
        _entry("openai_compatible", base_url="http://localhost:8080/v1"),
    ]

    providers = [create_provider(entry) for entry in entries]

    assert all(isinstance(provider, BaseProvider) for provider in providers)
    assert all(isinstance(provider.entry, ModelEntry) for provider in providers)


def test_provider_entry_is_normalized():
    legacy = ProviderEntry(id="openai", name="OpenAI", type="openai")
    provider = create_provider(legacy)
    assert provider.provider_name == "openai"
    assert isinstance(provider.entry, ModelEntry)
    assert provider.entry.provider == "openai"


def test_create_provider_openai():
    provider = create_provider(_entry(ProviderType.OPENAI.value, api_key_env="OPENAI_API_KEY"))
    assert provider.provider_name == "openai"


def test_create_provider_anthropic():
    provider = create_provider(_entry(ProviderType.ANTHROPIC.value))
    assert provider.provider_name == "anthropic"


def test_create_provider_gemini():
    provider = create_provider(_entry(ProviderType.GEMINI.value))
    assert provider.provider_name == "gemini"


def test_create_provider_ollama():
    provider = create_provider(_entry(ProviderType.OLLAMA.value, model_type="local"))
    assert provider.provider_name == "ollama"


def test_create_provider_lmstudio():
    provider = create_provider(_entry(ProviderType.LMSTUDIO.value, model_type="local"))
    assert provider.provider_name == "lmstudio"


def test_create_provider_openai_compatible():
    provider = create_provider(
        _entry(ProviderType.OPENAI_COMPATIBLE.value, base_url="http://localhost:8080/v1")
    )
    assert provider.provider_name == "openai_compatible"


def test_create_provider_unknown():
    with pytest.raises(ValueError, match="Unknown provider"):
        create_provider(_entry("unknown"))


def test_openai_check_connection_success():
    from nexus.models.providers.openai import OpenAIProvider

    entry = _entry(ProviderType.OPENAI.value, api_key="sk-test")
    provider = OpenAIProvider(entry)

    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("nexus.models.providers.openai.http_get", new_callable=AsyncMock, return_value=mock_response):
        assert asyncio.run(provider.check_connection()) is True


def test_ollama_generate_success():
    from nexus.models.providers.ollama import OllamaProvider

    entry = _entry(ProviderType.OLLAMA.value, model_type="local")
    provider = OllamaProvider(entry)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"message": {"content": "Hello from Ollama"}}
    mock_response.raise_for_status = MagicMock()

    with patch("nexus.models.providers.ollama.http_post", new_callable=AsyncMock, return_value=mock_response):
        result = asyncio.run(provider.generate("Hi"))
        assert result == "Hello from Ollama"
