"""Connector registry: tools + execution."""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.connectors.adapters import discord as discord_adapter
from app.connectors.adapters import github as github_adapter
from app.connectors.adapters import google_workspace as google_adapter
from app.connectors.adapters import vercel as vercel_adapter
from app.connectors.catalog import MVP_CONNECTOR_IDS
from app.services.connectors.store import get_credentials, list_chat_enabled

logger = logging.getLogger(__name__)

_ADAPTER_MAP = {
    "google_workspace": google_adapter,
    "github": github_adapter,
    "vercel": vercel_adapter,
    "discord": discord_adapter,
}

_TOOL_TO_CONNECTOR: dict[str, str] = {}


def _build_tool_index() -> None:
    if _TOOL_TO_CONNECTOR:
        return
    for cid, mod in _ADAPTER_MAP.items():
        for t in mod.tool_definitions():
            fn = t.get("function") or {}
            name = fn.get("name")
            if name:
                _TOOL_TO_CONNECTOR[name] = cid


def collect_tools_for_user(db: Session, user_id: int) -> list[dict]:
    _build_tool_index()
    tools: list[dict] = []
    for row in list_chat_enabled(db, user_id):
        mod = _ADAPTER_MAP.get(row.connector_id)
        if mod:
            tools.extend(mod.tool_definitions())
    return tools


async def execute_tool_call(
    db: Session,
    user_id: int,
    tool_name: str,
    arguments_json: str,
) -> str:
    _build_tool_index()
    connector_id = _TOOL_TO_CONNECTOR.get(tool_name)
    if not connector_id:
        return f"Unknown tool: {tool_name}"
    row = next(
        (r for r in list_chat_enabled(db, user_id) if r.connector_id == connector_id),
        None,
    )
    if not row:
        return f"Коннектор {connector_id} не подключён или отключён для чата."
    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError:
        args = {}
    creds = get_credentials(row)
    mod = _ADAPTER_MAP[connector_id]
    try:
        return await mod.execute_tool(db, user_id, creds, tool_name, args)
    except Exception as exc:
        logger.exception("connector tool %s failed", tool_name)
        return f"Ошибка {connector_id}: {exc}"


def connected_connector_ids_for_user(db: Session, user_id: int) -> list[str]:
    return [r.connector_id for r in list_chat_enabled(db, user_id) if r.connector_id in MVP_CONNECTOR_IDS]
