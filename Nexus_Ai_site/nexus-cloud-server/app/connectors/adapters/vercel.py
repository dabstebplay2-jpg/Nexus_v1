"""Vercel deployment tools."""

from __future__ import annotations

import httpx

from app.services.connectors.audit import log_connector_action

API = "https://api.vercel.com"


def tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "vercel_list_projects",
                "description": "List Vercel projects for the connected account.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "vercel_list_deployments",
                "description": "List recent deployments for a project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string"},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["project_id"],
                },
            },
        },
    ]


def _headers(creds: dict) -> dict:
    return {"Authorization": f"Bearer {creds.get('access_token')}"}


async def execute_tool(db, user_id: int, creds: dict, name: str, args: dict) -> str:
    if name == "vercel_list_projects":
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(f"{API}/v9/projects", headers=_headers(creds))
        log_connector_action(db, user_id=user_id, connector_id="vercel", action=name)
        if r.status_code >= 400:
            return f"Vercel {r.status_code}: {r.text[:400]}"
        projects = r.json().get("projects") or []
        lines = [f"- {p.get('name')} (id={p.get('id')})" for p in projects[:20]]
        return "\n".join(lines) if lines else "Проектов нет."

    if name == "vercel_list_deployments":
        pid = (args.get("project_id") or "").strip()
        limit = min(max(int(args.get("limit") or 5), 1), 10)
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{API}/v6/deployments",
                params={"projectId": pid, "limit": limit},
                headers=_headers(creds),
            )
        log_connector_action(
            db,
            user_id=user_id,
            connector_id="vercel",
            action=name,
            meta={"project_id": pid},
        )
        if r.status_code >= 400:
            return f"Vercel {r.status_code}: {r.text[:400]}"
        deps = r.json().get("deployments") or []
        lines = []
        for d in deps:
            lines.append(f"- {d.get('url')} | {d.get('state')} | {d.get('createdAt')}")
        return "\n".join(lines) if lines else "Деплоев нет."

    return f"Unknown Vercel tool: {name}"
