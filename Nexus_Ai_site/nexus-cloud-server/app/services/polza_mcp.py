"""MCP-клиент Polza.ai для управления API-ключами (лимиты после оплаты)."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import httpx

from app.config import POLZA_MCP_TOKEN, POLZA_MCP_URL

logger = logging.getLogger(__name__)


class PolzaMcpError(Exception):
    pass


async def _mcp_request(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    token = (POLZA_MCP_TOKEN or "").strip()
    if not token:
        raise PolzaMcpError("POLZA_MCP_TOKEN не задан на сервере")
    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": method,
    }
    if params is not None:
        payload["params"] = params
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(POLZA_MCP_URL, headers=headers, json=payload)
    if response.status_code >= 400:
        raise PolzaMcpError(f"MCP HTTP {response.status_code}: {response.text[:300]}")
    try:
        data = response.json()
    except json.JSONDecodeError as exc:
        raise PolzaMcpError(f"MCP invalid JSON: {response.text[:200]}") from exc
    if data.get("error"):
        err = data["error"]
        msg = err.get("message") if isinstance(err, dict) else str(err)
        raise PolzaMcpError(msg or "MCP error")
    return data.get("result") or {}


async def mcp_call_tool(name: str, arguments: dict[str, Any]) -> Any:
    result = await _mcp_request(
        "tools/call",
        {"name": name, "arguments": arguments},
    )
    if isinstance(result, dict) and result.get("isError"):
        content = result.get("content") or []
        text = ""
        if content and isinstance(content[0], dict):
            text = str(content[0].get("text") or "")
        raise PolzaMcpError(text or f"MCP tool {name} failed")
    if isinstance(result, dict) and "content" in result:
        content = result.get("content") or []
        if content and isinstance(content[0], dict):
            raw = content[0].get("text")
            if isinstance(raw, str):
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    return raw
        return result
    return result


async def mcp_list_api_keys() -> list[dict[str, Any]]:
    data = await mcp_call_tool("list_api_keys", {})
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("keys", "items", "data"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def _api_key_row_id(row: dict[str, Any]) -> str | None:
    for field in ("id", "key_id", "keyId", "hash"):
        val = row.get(field)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def _created_api_key_id(raw: Any) -> str | None:
    if not isinstance(raw, dict):
        return None
    direct = _api_key_row_id(raw)
    if direct:
        return direct
    for field in ("data", "apiKey", "api_key", "key"):
        nested = raw.get(field)
        if isinstance(nested, dict):
            found = _created_api_key_id(nested)
            if found:
                return found
    return None


def _api_key_row_name(row: dict[str, Any]) -> str:
    for field in ("name", "label", "title", "user", "email"):
        val = row.get(field)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


async def find_polza_keys_by_name(name: str) -> list[dict[str, Any]]:
    """Ключи Polza с каноническим именем (без учёта регистра)."""
    target = (name or "").strip().lower()
    if not target:
        return []
    rows = await mcp_list_api_keys()
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        row_name = _api_key_row_name(row).lower()
        if row_name == target:
            out.append(row)
    return out


async def delete_polza_keys_by_name(name: str) -> int:
    """Удалить ключи; без keys.danger — безопасно заблокировать через keys.write."""
    removed = 0
    for row in await find_polza_keys_by_name(name):
        key_id = _api_key_row_id(row)
        if not key_id:
            continue
        if await mcp_delete_api_key(key_id=key_id):
            removed += 1
        elif await mcp_quarantine_api_key(key_id=key_id):
            removed += 1
    return removed


async def mcp_create_api_key(
    *,
    name: str,
    amount_rub: float = 0.0,
) -> dict[str, Any]:
    """Создать API-ключ в org Polza (ключ показывается один раз в ответе)."""
    # Current Polza MCP create_api_key accepts only `name`; limits are applied
    # immediately afterwards through update_api_key.
    data = await mcp_call_tool("create_api_key", {"name": name[:64]})
    amount = max(0.0, round(float(amount_rub), 2))
    if amount > 0:
        key_id = _created_api_key_id(data)
        if not key_id:
            raise PolzaMcpError("Polza создала ключ без ID — невозможно установить лимит")
        if not await mcp_update_api_key_monthly_limit(key_id=key_id, amount_rub=amount):
            raise PolzaMcpError("Polza создала ключ, но не применила месячный лимит")
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        return {"key": data}
    return {}


async def mcp_delete_api_key(*, key_id: str) -> bool:
    if not key_id:
        return False
    try:
        await mcp_call_tool("delete_api_key", {"keyId": key_id})
        return True
    except PolzaMcpError as exc:
        logger.warning("MCP delete_api_key failed: %s", exc)
        return False


async def mcp_update_api_key_monthly_limit(
    *,
    api_key_prefix: str | None = None,
    key_id: str | None = None,
    amount_rub: float,
) -> bool:
    """Поднять месячный лимит расходов ключа (₽) после оплаты ЮKassa."""
    amount = max(0.0, round(float(amount_rub), 2))
    if amount <= 0:
        return False
    resolved_key_id = str(key_id or "").strip()
    if key_id:
        resolved_key_id = str(key_id)
    elif api_key_prefix:
        target = api_key_prefix.strip().lower()
        for row in await mcp_list_api_keys():
            prefix = str(
                row.get("keyPrefix") or row.get("key_prefix") or row.get("prefix") or ""
            ).strip().lower()
            if prefix and (prefix.startswith(target) or target.startswith(prefix)):
                resolved_key_id = _api_key_row_id(row) or ""
                break
    else:
        raise PolzaMcpError("key_id or api_key_prefix required")
    if not resolved_key_id:
        logger.warning("MCP update_api_key: key not found by prefix")
        return False
    arguments: dict[str, Any] = {
        "keyId": resolved_key_id,
        "limitAmount": amount,
        "limitPeriod": "month",
    }
    try:
        await mcp_call_tool("update_api_key", arguments)
        return True
    except PolzaMcpError as exc:
        logger.warning("MCP update_api_key failed: %s", exc)
        return False


async def mcp_quarantine_api_key(*, key_id: str) -> bool:
    """Make a key unusable when the MCP token cannot hard-delete it."""
    if not key_id:
        return False
    try:
        await mcp_call_tool(
            "update_api_key",
            {
                "keyId": str(key_id),
                "name": f"disabled-{str(key_id)[:24]}",
                "limitAmount": 0.01,
                "limitPeriod": "total",
            },
        )
        logger.warning("Polza key %s quarantined because hard delete is unavailable", key_id)
        return True
    except PolzaMcpError as exc:
        logger.error("MCP key quarantine failed: %s", exc)
        return False


async def mcp_get_org_balance_rub() -> float | None:
    try:
        data = await mcp_call_tool("get_balance", {})
    except PolzaMcpError:
        try:
            data = await mcp_call_tool("get_balance_details", {})
        except PolzaMcpError as exc:
            logger.warning("MCP get_balance failed: %s", exc)
            return None
    if isinstance(data, dict):
        for field in ("amount", "balance", "balance_rub", "available"):
            val = data.get(field)
            if val is not None:
                try:
                    return float(val)
                except (TypeError, ValueError):
                    continue
    return None
