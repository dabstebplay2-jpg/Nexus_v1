"""Токены привязки Telegram."""

from app.services.telegram_link import build_deep_link, create_link_token, mask_email


def test_mask_email():
    assert mask_email("dabstebplay@gmail.com").startswith("da")
    assert "@gmail.com" in mask_email("dabstebplay@gmail.com")


def test_create_link_token_memory(monkeypatch):
    monkeypatch.setattr("app.services.telegram_link.redis_persistence_enabled", lambda: False)
    token, ttl = create_link_token(42)
    assert len(token) >= 16
    assert ttl >= 60
    url = build_deep_link(token)
    assert "t.me/" in url
    assert token in url
