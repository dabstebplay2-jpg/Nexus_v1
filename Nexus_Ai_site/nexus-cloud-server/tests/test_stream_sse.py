"""Парсинг thinking/content из OpenAI-совместимых SSE chunks."""

from app.routers.ai import _coerce_text, _reasoning_from_details, _stream_text_parts


def test_coerce_text_string():
    assert _coerce_text("hello") == "hello"


def test_coerce_text_reasoning_list():
    chunks = [{"text": "step1"}, {"content": "step2"}]
    assert "step1" in _coerce_text(chunks)


def test_stream_text_parts_reasoning_delta():
    delta = {"reasoning_content": "думаю", "content": "ответ"}
    thinking, content = _stream_text_parts(delta, {})
    assert thinking == "думаю"
    assert content == "ответ"


def test_stream_text_parts_reasoning_only():
    thinking, content = _stream_text_parts({"reasoning": "a"}, {})
    assert thinking == "a"
    assert content == ""


def test_stream_text_parts_message_fallback():
    thinking, content = _stream_text_parts(
        {},
        {"reasoning_content": "from message", "content": "answer"},
    )
    assert thinking == "from message"
    assert content == "answer"


def test_reasoning_from_details_array():
    details = [
        {"type": "reasoning.text", "text": "step one"},
        {"type": "reasoning.text", "text": " step two"},
    ]
    assert _reasoning_from_details(details) == "step one step two"


def test_stream_text_parts_reasoning_details_delta():
    delta = {
        "reasoning_details": [{"type": "reasoning.text", "text": "думаю"}],
        "content": "ответ",
    }
    thinking, content = _stream_text_parts(delta, {})
    assert thinking == "думаю"
    assert content == "ответ"
