from unittest.mock import AsyncMock

import pytest

from app.services import email_login


@pytest.mark.asyncio
async def test_local_dev_mode_returns_otp(db_session, monkeypatch):
    monkeypatch.setattr(email_login, "NEXUS_AUTH_DEV_LOG_CODES", True)
    monkeypatch.setattr(email_login, "is_production_environment", lambda: False)
    monkeypatch.setattr(email_login, "assert_rate_limit_async", AsyncMock())
    send_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(email_login, "send_login_code_email", send_mock)

    result = await email_login.request_login_code(db_session, "local@example.com", "127.0.0.1")

    assert result["dev_code"].isdigit()
    assert len(result["dev_code"]) == 6
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_production_never_returns_otp(db_session, monkeypatch):
    monkeypatch.setattr(email_login, "NEXUS_AUTH_DEV_LOG_CODES", True)
    monkeypatch.setattr(email_login, "is_production_environment", lambda: True)
    monkeypatch.setattr(email_login, "assert_rate_limit_async", AsyncMock())
    send_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(email_login, "send_login_code_email", send_mock)

    result = await email_login.request_login_code(db_session, "prod@example.com", "203.0.113.1")

    assert "dev_code" not in result
    send_mock.assert_awaited_once()
