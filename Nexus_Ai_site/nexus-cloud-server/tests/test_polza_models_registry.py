from unittest.mock import AsyncMock

import pytest

from app.services import models_registry as reg


def test_normalize_current_polza_catalog_schema(monkeypatch):
    monkeypatch.setattr(reg, "get_usd_rub_rate_sync", lambda: 100.0)
    raw = {
        "id": "vendor/new-model",
        "name": "Vendor: New Model",
        "type": "chat",
        "short_description": "Fresh model",
        "created": 1_800_000_000,
        "architecture": {
            "modality": "text+image->text",
            "input_modalities": ["text", "image"],
            "output_modalities": ["text"],
        },
        "top_provider": {
            "context_length": 1_050_000,
            "pricing": {
                "currency": "RUB",
                "prompt_per_million": "100",
                "completion_per_million": "200",
            },
            "supported_parameters": ["tools", "reasoning"],
        },
        "endpoints": ["/api/v1/chat/completions"],
    }

    model = reg._normalize(raw)

    assert model["context_k"] == 1050
    assert model["supports_vision"] is True
    assert model["supports_tools"] is True
    assert model["price_1m_usd"] == pytest.approx(3.0)
    assert model["pricing"]["prompt"] == pytest.approx(1 / 1_000_000)
    assert model["pricing"]["completion"] == pytest.approx(2 / 1_000_000)


def _auto_model(model_id: str, *, created: int, price: float, model_type: str = "chat") -> dict:
    return {
        "id": model_id,
        "name": model_id,
        "provider": "Vendor",
        "description": "",
        "model_type": model_type,
        "created": created,
        "output_modalities": ["text"],
        "input_modalities": ["text"],
        "supported_parameters": ["reasoning"],
        "supports_vision": False,
        "supports_tools": False,
        "price_1m_usd": price,
        "pricing": {"prompt": 0, "completion": 0},
        "pricing_rub_1m": {"prompt": 10, "completion": 20},
    }


def test_latest_models_are_auto_added_and_non_chat_is_ignored(monkeypatch):
    monkeypatch.setattr(reg, "MAX_MODELS_FOR_USER", 10)
    monkeypatch.setattr(reg, "AUTO_DISCOVERED_MODELS_LIMIT", 5)
    source = [
        _auto_model("vendor/older", created=100, price=1.0),
        _auto_model("vendor/newest", created=300, price=12.0),
        _auto_model("vendor/audio", created=400, price=1.0, model_type="audio"),
    ]

    result = reg._append_auto_discovered_models(source, [])

    assert [m["id"] for m in result] == ["vendor/newest", "vendor/older"]
    assert result[0]["auto_discovered"] is True
    assert result[0]["min_tier"] == "PRO"
    assert result[0]["supports_thinking"] is True
    assert result[1]["min_tier"] == "HOBBY"


@pytest.mark.asyncio
async def test_refresh_all_model_sources_updates_both_catalogs(monkeypatch):
    polza_refresh = AsyncMock()
    openrouter_refresh = AsyncMock()
    monkeypatch.setattr(reg, "refresh_models_cache", polza_refresh)
    monkeypatch.setattr(reg.or_models, "refresh_free_models_cache", openrouter_refresh)

    await reg.refresh_all_model_sources(force=True)

    polza_refresh.assert_awaited_once_with(force=True)
    openrouter_refresh.assert_awaited_once_with(force=True)


def test_models_disk_cache_round_trip(tmp_path, monkeypatch):
    cache_path = tmp_path / "models.json"
    monkeypatch.setattr(reg, "MODELS_DISK_CACHE_PATH", cache_path)
    rows = [{"id": "vendor/model", "type": "chat"}]

    reg._write_models_disk_cache(rows)
    restored, cached_at = reg._read_models_disk_cache()

    assert restored == rows
    assert cached_at > 0
