from app.schemas import ChatMessage, SimpleChatRequest
from app.services import message_builder as mb


def test_enable_thinking_adds_reasoning_param(monkeypatch):
    monkeypatch.setattr(
        mb.reg,
        "get_model",
        lambda mid: {"id": mid, "thinking_via_reasoning_api": True}
        if mid == "openai/gpt-5.4"
        else None,
    )
    payload = SimpleChatRequest(
        model="openai/gpt-5.4",
        messages=[ChatMessage(role="user", content="hi")],
        enable_thinking=True,
    )
    body = mb.build_router_payload("openai/gpt-5.4", payload)
    assert body["model"] == "openai/gpt-5.4"
    assert body.get("reasoning") == {"enabled": True, "effort": "medium"}
    assert body.get("include_reasoning") is True


def test_enable_thinking_fallback_by_model_id(monkeypatch):
    monkeypatch.setattr(mb.reg, "get_model", lambda _mid: None)
    payload = SimpleChatRequest(
        model="openai/gpt-5.4",
        messages=[ChatMessage(role="user", content="hi")],
        enable_thinking=True,
    )
    body = mb.build_router_payload("openai/gpt-5.4", payload)
    assert body.get("reasoning")
