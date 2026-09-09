"""FREE tier + OpenRouter catalog and access rules."""

from __future__ import annotations

import pytest

from app.services import openrouter_models as or_models
from app.services.models_registry import model_access_detail, model_allowed
from app.tiers import tier_allows_ai, tier_uses_openrouter_free

SAMPLE_MODELS = {
    "data": [
        {
            "id": "meta-llama/llama-3.2-3b-instruct:free",
            "name": "Llama 3.2 3B Instruct (free)",
            "context_length": 128000,
            "pricing": {"prompt": "0", "completion": "0", "request": "0"},
            "architecture": {
                "modality": "text->text",
                "input_modalities": ["text"],
                "output_modalities": ["text"],
            },
            "supported_parameters": ["tools", "tool_choice"],
        },
        {
            "id": "openai/gpt-4o",
            "name": "GPT-4o",
            "context_length": 128000,
            "pricing": {"prompt": "0.0000025", "completion": "0.00001", "request": "0"},
            "architecture": {
                "modality": "text->text",
                "input_modalities": ["text"],
                "output_modalities": ["text"],
            },
        },
        {
            "id": "openai/text-embedding-3-small",
            "name": "Embedding",
            "context_length": 8192,
            "pricing": {"prompt": "0", "completion": "0", "request": "0"},
            "architecture": {
                "modality": "text->text",
                "input_modalities": ["text"],
                "output_modalities": ["text"],
            },
        },
    ]
}


@pytest.fixture(autouse=True)
def _reset_openrouter_cache():
    or_models._cache["fetched_at"] = 0.0
    or_models._cache["chat_models"] = []
    or_models._cache["research_models"] = []
    or_models._cache["media_models"] = []
    or_models._cache["by_id"] = {}
    yield


def test_tier_free_flags():
    assert tier_allows_ai("FREE") is True
    assert tier_uses_openrouter_free("FREE") is True
    assert tier_uses_openrouter_free("HOBBY") is False


def test_is_zero_price_model():
    assert or_models.is_zero_price_model(SAMPLE_MODELS["data"][0]) is True
    assert or_models.is_zero_price_model(SAMPLE_MODELS["data"][1]) is False


@pytest.mark.asyncio
async def test_refresh_free_models_filters_zero_price_chat(monkeypatch):
    monkeypatch.setattr(
        "app.config.OPENROUTER_API_KEY",
        "sk-or-test",
        raising=False,
    )
    monkeypatch.setattr(
        "app.config.openrouter_free_tier_enabled",
        lambda: True,
        raising=False,
    )

    async def fake_fetch():
        return [or_models._normalize(raw) for raw in SAMPLE_MODELS["data"] if or_models.is_zero_price_model(raw) and or_models._is_chat_model(raw)]

    monkeypatch.setattr(or_models, "_fetch_openrouter_models", fake_fetch)

    await or_models.refresh_free_models_cache(force=True)
    ids = [m["id"] for m in or_models._cache["chat_models"]]
    assert "meta-llama/llama-3.2-3b-instruct:free" in ids
    assert "openai/gpt-4o" not in ids
    assert "openai/text-embedding-3-small" not in ids
    assert "openrouter/free" in ids


@pytest.mark.asyncio
async def test_refresh_free_models_keeps_router_when_catalog_is_unavailable(monkeypatch):
    monkeypatch.setattr(
        "app.services.openrouter_models.openrouter_free_tier_enabled",
        lambda: True,
    )

    async def failed_fetch():
        raise RuntimeError("temporary catalog outage")

    monkeypatch.setattr(or_models, "_fetch_openrouter_models", failed_fetch)

    await or_models.refresh_free_models_cache(force=True)

    assert [m["id"] for m in or_models._cache["chat_models"]] == ["openrouter/free"]
    assert or_models.free_model_allowed("openrouter/free") is True


@pytest.mark.asyncio
async def test_free_model_access_allowed(monkeypatch):
    monkeypatch.setattr(
        "app.config.OPENROUTER_API_KEY",
        "sk-or-test",
        raising=False,
    )
    monkeypatch.setattr(
        "app.config.openrouter_free_tier_enabled",
        lambda: True,
        raising=False,
    )

    async def fake_fetch():
        return [or_models._normalize(raw) for raw in SAMPLE_MODELS["data"] if or_models.is_zero_price_model(raw) and or_models._is_chat_model(raw)]

    monkeypatch.setattr(or_models, "_fetch_openrouter_models", fake_fetch)
    await or_models.refresh_free_models_cache(force=True)

    assert model_allowed("FREE", "meta-llama/llama-3.2-3b-instruct:free") is True
    assert model_allowed("FREE", "openai/gpt-4o") is False
    detail = model_access_detail("FREE", "meta-llama/llama-3.2-3b-instruct:free")
    assert detail["allowed"] is True


def test_hobby_cannot_use_openrouter_free_catalog_without_polza_model(monkeypatch):
    monkeypatch.setattr(
        "app.services.models_registry.get_model",
        lambda mid: None,
    )
    assert model_allowed("HOBBY", "meta-llama/llama-3.2-3b-instruct:free") is False
