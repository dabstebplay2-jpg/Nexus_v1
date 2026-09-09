"""Browser page context injection."""

from app.schemas import BrowserPageContext, ChatMessage, SimpleChatRequest
from app.services.browser_context import (
    build_page_context_system,
    inject_page_context_messages,
    sanitize_page_context,
)
from app.services.message_builder import build_router_payload


def test_sanitize_page_context_truncates():
    ctx = BrowserPageContext(url="https://a.com", title="T", excerpt="x" * 31_000)
    clean = sanitize_page_context(ctx)
    assert clean is not None
    assert len(clean.excerpt) <= 32_000
    assert "example.com" in build_page_context_system(
        BrowserPageContext(url="https://example.com", title="E", excerpt="hi")
    )


def test_inject_page_context_adds_system_message():
    ctx = BrowserPageContext(url="https://example.com", title="Example", excerpt="Hello world")
    out = inject_page_context_messages([{"role": "user", "content": "что на странице?"}], ctx)
    assert out[0]["role"] == "system"
    assert "example.com" in out[0]["content"]
    assert out[1]["role"] == "user"


def test_build_router_payload_with_page_context():
    payload = SimpleChatRequest(
        model="test/model",
        messages=[ChatMessage(role="user", content="hi")],
        page_context=BrowserPageContext(
            url="https://test.io",
            title="Test",
            excerpt="body text",
        ),
    )
    body = build_router_payload("test/model", payload)
    assert body["messages"][0]["role"] == "system"
    assert "test.io" in body["messages"][0]["content"]
