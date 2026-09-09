from app.services.user_memory import format_memory_system_block, inject_user_memory_messages


def test_inject_user_memory_prepends_system():
    messages = [{"role": "user", "content": "hi"}]
    out = inject_user_memory_messages(messages, "Любит Python")
    assert len(out) == 2
    assert out[0]["role"] == "system"
    assert "Любит Python" in out[0]["content"]
    assert out[1]["role"] == "user"


def test_inject_skips_empty():
    messages = [{"role": "user", "content": "hi"}]
    assert inject_user_memory_messages(messages, "") == messages
    assert inject_user_memory_messages(messages, "   ") == messages


def test_format_memory_block():
    block = format_memory_system_block("Тест")
    assert "Тест" in block
    assert "память" in block.lower() or "пользовател" in block.lower()
