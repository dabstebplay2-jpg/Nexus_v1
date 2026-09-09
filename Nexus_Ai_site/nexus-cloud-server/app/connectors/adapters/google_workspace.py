"""Gmail + Calendar read-only tools."""

from __future__ import annotations

import httpx

from app.services.connectors.audit import log_connector_action
from app.time_utils import utc_now

GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "gmail_search",
                "description": "Search Gmail messages (read-only). Returns message ids and snippets.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Gmail search query"},
                        "max_results": {"type": "integer", "description": "Max results 1-10", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "gmail_get_message",
                "description": "Get a Gmail message by id (headers + snippet).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message_id": {"type": "string"},
                    },
                    "required": ["message_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "calendar_list_events",
                "description": "List upcoming Google Calendar events (read-only).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "max_results": {"type": "integer", "default": 10},
                    },
                },
            },
        },
    ]


async def execute_tool(db, user_id: int, creds: dict, name: str, args: dict) -> str:
    token = creds.get("access_token")
    if not token:
        return "Google: нет access_token, переподключите коннектор."
    headers = {"Authorization": f"Bearer {token}"}

    if name == "gmail_search":
        q = (args.get("query") or "").strip()
        max_r = min(max(int(args.get("max_results") or 5), 1), 10)
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{GMAIL_API}/messages",
                params={"q": q, "maxResults": max_r},
                headers=headers,
            )
        log_connector_action(db, user_id=user_id, connector_id="google_workspace", action=name, meta={"q": q})
        if r.status_code >= 400:
            return f"Gmail error {r.status_code}: {r.text[:500]}"
        data = r.json()
        lines = []
        for mid in data.get("messages") or []:
            msg_id = mid.get("id")
            if not msg_id:
                continue
            async with httpx.AsyncClient(timeout=20.0) as client:
                mr = await client.get(
                    f"{GMAIL_API}/messages/{msg_id}",
                    params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
                    headers=headers,
                )
            if mr.status_code >= 400:
                continue
            m = mr.json()
            hdr = {h["name"]: h["value"] for h in m.get("payload", {}).get("headers", [])}
            lines.append(
                f"- id={msg_id} | From: {hdr.get('From','?')} | {hdr.get('Subject','(no subject)')} | {m.get('snippet','')[:120]}"
            )
        return "\n".join(lines) if lines else "Писем не найдено."

    if name == "gmail_get_message":
        msg_id = (args.get("message_id") or "").strip()
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{GMAIL_API}/messages/{msg_id}",
                params={"format": "full"},
                headers=headers,
            )
        log_connector_action(db, user_id=user_id, connector_id="google_workspace", action=name, meta={"id": msg_id})
        if r.status_code >= 400:
            return f"Gmail error {r.status_code}: {r.text[:400]}"
        m = r.json()
        return f"Snippet: {m.get('snippet','')}\n\n(Полное тело обрезано в MVP)"

    if name == "calendar_list_events":
        max_r = min(max(int(args.get("max_results") or 10), 1), 20)
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{CALENDAR_API}/calendars/primary/events",
                params={
                    "maxResults": max_r,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "timeMin": utc_now().isoformat() + "Z",
                },
                headers=headers,
            )
        log_connector_action(db, user_id=user_id, connector_id="google_workspace", action=name)
        if r.status_code >= 400:
            return f"Calendar error {r.status_code}: {r.text[:400]}"
        items = r.json().get("items") or []
        lines = []
        for ev in items:
            start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date", "?")
            lines.append(f"- {start} | {ev.get('summary', '(no title)')}")
        return "\n".join(lines) if lines else "Событий не найдено."

    return f"Unknown Google tool: {name}"
