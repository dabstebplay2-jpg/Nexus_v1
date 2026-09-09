"""Discord webhook post tool."""

from __future__ import annotations

import httpx

from app.services.connectors.audit import log_connector_action


def tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "discord_send_message",
                "description": "Post a message to the user's configured Discord channel webhook.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "Message text (max 2000 chars)"},
                    },
                    "required": ["content"],
                },
            },
        },
    ]


async def execute_tool(db, user_id: int, creds: dict, name: str, args: dict) -> str:
    if name != "discord_send_message":
        return f"Unknown Discord tool: {name}"
    url = (creds.get("webhook_url") or "").strip()
    if not url.startswith("https://discord.com/api/webhooks/"):
        return "Discord: неверный webhook URL, переподключите коннектор."
    content = (args.get("content") or "").strip()[:2000]
    if not content:
        return "Пустое сообщение."
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json={"content": content})
    log_connector_action(
        db,
        user_id=user_id,
        connector_id="discord",
        action=name,
        meta={"len": len(content)},
    )
    if r.status_code >= 400:
        return f"Discord webhook {r.status_code}: {r.text[:300]}"
    return "Сообщение отправлено в Discord."
