"""Agent loop: RouterAI tool calls for user connectors."""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from sqlalchemy.orm import Session

from app.connectors.registry import (
    collect_tools_for_user,
    connected_connector_ids_for_user,
    execute_tool_call,
)
from app.database import UserDB

logger = logging.getLogger(__name__)

MAX_CONNECTOR_STEPS = 6

_CONNECTOR_SYSTEM = (
    "У пользователя подключены внешние сервисы (коннекторы). "
    "Используй только доступные tools для получения реальных данных. "
    "Не выдумывай письма, репозитории или деплои. "
    "После получения данных ответь пользователю кратко на русском."
)


async def run_connector_agent_phase(
    db: Session,
    user: UserDB,
    *,
    model: str,
    messages: list[dict],
    call_routerai,
) -> AsyncIterator[dict[str, Any]]:
    """
  Yields SSE payload dicts: tool_start, tool_end, connector_status.
  Mutates `messages` in place with assistant/tool turns.
  """
    tools = collect_tools_for_user(db, user.id)
    if not tools:
        return

    connected = connected_connector_ids_for_user(db, user.id)
    yield {"type": "connector_status", "connectors": connected}

    work_messages = list(messages)
    if work_messages and work_messages[0].get("role") == "system":
        work_messages[0] = {
            "role": "system",
            "content": (work_messages[0].get("content") or "") + "\n\n" + _CONNECTOR_SYSTEM,
        }
    else:
        work_messages.insert(0, {"role": "system", "content": _CONNECTOR_SYSTEM})

    used_any_tool = False
    for step in range(MAX_CONNECTOR_STEPS):
        payload = {
            "model": model,
            "messages": work_messages,
            "tools": tools,
            "tool_choice": "auto",
        }
        try:
            data = await call_routerai(payload, user)
        except Exception as exc:
            logger.warning("connector agent router call failed: %s", exc)
            yield {"type": "error", "detail": f"Ошибка коннекторов: {exc}"}
            return

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls")

        if not tool_calls:
            # Это черновик ответа роутера инструментов. Финальный ответ ниже
            # стримит выбранная пользователем модель, поэтому не добавляем
            # подряд второе assistant-сообщение в историю.
            break

        work_messages.append(message)

        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name") or ""
            raw_args = fn.get("arguments") or "{}"
            used_any_tool = True
            yield {"type": "tool_start", "tool": name, "connector": _tool_connector_hint(name)}

            result = await execute_tool_call(db, user.id, name, raw_args)
            yield {
                "type": "tool_end",
                "tool": name,
                "connector": _tool_connector_hint(name),
                "ok": not result.lower().startswith("ошибка"),
            }

            work_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id"),
                    "name": name,
                    "content": result[:12000],
                }
            )

    if used_any_tool:
        messages.clear()
        messages.extend(work_messages)


def _tool_connector_hint(tool_name: str) -> str:
    if tool_name.startswith("gmail_") or tool_name.startswith("calendar_"):
        return "google_workspace"
    if tool_name.startswith("github_"):
        return "github"
    if tool_name.startswith("vercel_"):
        return "vercel"
    if tool_name.startswith("discord_"):
        return "discord"
    return ""
