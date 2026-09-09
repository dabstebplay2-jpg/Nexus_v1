"""Telegram auth helpers."""

import hashlib
import hmac
import time

import pytest

from app.services.telegram_auth import (
    is_telegram_synthetic_email,
    telegram_synthetic_email,
    verify_telegram_login_widget,
)


def test_synthetic_email():
    assert is_telegram_synthetic_email("tg123@tg.nexus")
    assert not is_telegram_synthetic_email("user@gmail.com")
    assert telegram_synthetic_email(42) == "tg42@tg.nexus"


def test_verify_widget_rejects_bad_hash(monkeypatch):
    monkeypatch.setattr("app.services.telegram_auth.telegram_bot_enabled", lambda: True)
    monkeypatch.setattr("app.services.telegram_auth.TELEGRAM_BOT_TOKEN", "test-token")
    with pytest.raises(ValueError, match="подпись"):
        verify_telegram_login_widget(
            {
                "id": 1,
                "first_name": "A",
                "auth_date": int(time.time()),
                "hash": "bad",
            }
        )


def test_verify_widget_accepts_valid_hash(monkeypatch):
    token = "123456:ABC-DEF"
    monkeypatch.setattr("app.services.telegram_auth.telegram_bot_enabled", lambda: True)
    monkeypatch.setattr("app.services.telegram_auth.TELEGRAM_BOT_TOKEN", token)
    auth_date = str(int(time.time()))
    data = {
        "id": "99",
        "first_name": "Test",
        "username": "tester",
        "auth_date": auth_date,
    }
    pairs = [f"{k}={data[k]}" for k in sorted(data.keys())]
    check_string = "\n".join(pairs)
    secret = hashlib.sha256(token.encode()).digest()
    data["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    out = verify_telegram_login_widget(data)
    assert out["id"] == "99"
