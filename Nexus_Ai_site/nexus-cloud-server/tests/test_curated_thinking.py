"""Режим мышления: не подменять GPT-5.4 / Kimi K2.6 на Pro / K2 Thinking."""

from app.curated_models import _family_to_item, _resolve_family


def _fake_router(*ids: str) -> dict:
    return {mid: {"id": mid, "name": mid} for mid in ids}


def test_gpt54_thinking_stays_on_standard_model():
    by_id = _fake_router("openai/gpt-5.4", "openai/gpt-5.4-pro")
    spec = {
        "family_id": "gpt-5.4",
        "display_name": "GPT-5.4",
        "segment": "medium",
        "thinking_hint": "Режим мышления · GPT-5.4",
        "price_hint": "",
        "quality": 91,
    }
    resolved = _resolve_family(
        by_id,
        {
            **spec,
            "standard_match": ["openai/gpt-5.4"],
            "thinking_match": [],
            "thinking_via_reasoning_api": True,
        },
    )
    item = _family_to_item(resolved, spec, "chat")
    assert item["model_id_standard"] == "openai/gpt-5.4"
    assert item["model_id_thinking"] == "openai/gpt-5.4"
    assert item["thinking_via_reasoning_api"] is True
    assert item["supports_thinking"] is True


def test_kimi26_thinking_stays_on_standard_model():
    by_id = _fake_router("moonshotai/kimi-k2.6", "moonshotai/kimi-k2-thinking")
    spec = {
        "family_id": "kimi-k2.6",
        "display_name": "Kimi K2.6",
        "segment": "medium",
        "thinking_hint": "Режим мышления · Kimi K2.6",
        "price_hint": "",
        "quality": 90,
    }
    resolved = _resolve_family(
        by_id,
        {
            **spec,
            "standard_match": ["moonshotai/kimi-k2.6"],
            "thinking_match": [],
            "thinking_via_reasoning_api": True,
        },
    )
    item = _family_to_item(resolved, spec, "chat")
    assert item["model_id_standard"] == "moonshotai/kimi-k2.6"
    assert item["model_id_thinking"] == "moonshotai/kimi-k2.6"
    assert item["thinking_via_reasoning_api"] is True


def test_gpt55_still_maps_to_pro_when_separate():
    by_id = _fake_router("openai/gpt-5.5", "openai/gpt-5.5-pro")
    spec = {
        "family_id": "gpt-5.5",
        "display_name": "GPT-5.5",
        "segment": "expensive",
        "thinking_hint": "GPT-5.5 Pro",
        "price_hint": "",
        "quality": 95,
    }
    resolved = _resolve_family(
        by_id,
        {
            **spec,
            "standard_match": ["openai/gpt-5.5"],
            "thinking_match": ["openai/gpt-5.5-pro"],
            "thinking_via_reasoning_api": False,
        },
    )
    item = _family_to_item(resolved, spec, "chat")
    assert item["model_id_standard"] == "openai/gpt-5.5"
    assert item["model_id_thinking"] == "openai/gpt-5.5-pro"
    assert not item.get("thinking_via_reasoning_api")
