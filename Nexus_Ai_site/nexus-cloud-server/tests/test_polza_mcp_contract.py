from unittest.mock import AsyncMock

import pytest

from app.services import polza_mcp


@pytest.mark.asyncio
async def test_update_key_uses_current_polza_mcp_contract(monkeypatch):
    call = AsyncMock(return_value={})
    monkeypatch.setattr(polza_mcp, "mcp_call_tool", call)

    ok = await polza_mcp.mcp_update_api_key_monthly_limit(
        key_id="key-123",
        amount_rub=1250,
    )

    assert ok is True
    call.assert_awaited_once_with(
        "update_api_key",
        {"keyId": "key-123", "limitAmount": 1250.0, "limitPeriod": "month"},
    )


@pytest.mark.asyncio
async def test_create_key_applies_limit_in_second_call(monkeypatch):
    call = AsyncMock(side_effect=[{"id": "key-456", "rawKey": "pza_secret"}, {}])
    monkeypatch.setattr(polza_mcp, "mcp_call_tool", call)

    result = await polza_mcp.mcp_create_api_key(name="nexus-user@example.com", amount_rub=900)

    assert result["id"] == "key-456"
    assert call.await_args_list[0].args == ("create_api_key", {"name": "nexus-user@example.com"})
    assert call.await_args_list[1].args == (
        "update_api_key",
        {"keyId": "key-456", "limitAmount": 900.0, "limitPeriod": "month"},
    )


@pytest.mark.asyncio
async def test_delete_key_uses_key_id(monkeypatch):
    call = AsyncMock(return_value={})
    monkeypatch.setattr(polza_mcp, "mcp_call_tool", call)

    assert await polza_mcp.mcp_delete_api_key(key_id="key-789") is True
    call.assert_awaited_once_with("delete_api_key", {"keyId": "key-789"})


@pytest.mark.asyncio
async def test_quarantine_key_caps_total_spend(monkeypatch):
    call = AsyncMock(return_value={})
    monkeypatch.setattr(polza_mcp, "mcp_call_tool", call)

    assert await polza_mcp.mcp_quarantine_api_key(key_id="key-999") is True
    call.assert_awaited_once_with(
        "update_api_key",
        {
            "keyId": "key-999",
            "name": "disabled-key-999",
            "limitAmount": 0.01,
            "limitPeriod": "total",
        },
    )
