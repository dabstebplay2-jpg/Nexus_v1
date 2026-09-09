"""GitHub read tools."""

from __future__ import annotations

import httpx

from app.services.connectors.audit import log_connector_action

API = "https://api.github.com"


def tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "github_list_repos",
                "description": "List user GitHub repositories.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "visibility": {
                            "type": "string",
                            "enum": ["all", "public", "private"],
                            "default": "all",
                        },
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "github_get_file",
                "description": "Get file content from a repo (path on default branch).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "owner": {"type": "string"},
                        "repo": {"type": "string"},
                        "path": {"type": "string"},
                    },
                    "required": ["owner", "repo", "path"],
                },
            },
        },
    ]


def _headers(creds: dict) -> dict:
    return {
        "Authorization": f"Bearer {creds.get('access_token')}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def execute_tool(db, user_id: int, creds: dict, name: str, args: dict) -> str:
    if name == "github_list_repos":
        vis = args.get("visibility") or "all"
        params = {"per_page": 15, "sort": "updated"}
        if vis != "all":
            params["visibility"] = vis
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(f"{API}/user/repos", params=params, headers=_headers(creds))
        log_connector_action(db, user_id=user_id, connector_id="github", action=name)
        if r.status_code >= 400:
            return f"GitHub {r.status_code}: {r.text[:400]}"
        lines = [f"- {x.get('full_name')} ({x.get('private') and 'private' or 'public'})" for x in r.json()[:15]]
        return "\n".join(lines) if lines else "Репозиториев нет."

    if name == "github_get_file":
        owner = args.get("owner", "").strip()
        repo = args.get("repo", "").strip()
        path = args.get("path", "").strip().lstrip("/")
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{API}/repos/{owner}/{repo}/contents/{path}",
                headers=_headers(creds),
            )
        log_connector_action(
            db,
            user_id=user_id,
            connector_id="github",
            action=name,
            meta={"repo": f"{owner}/{repo}", "path": path},
        )
        if r.status_code >= 400:
            return f"GitHub {r.status_code}: {r.text[:400]}"
        data = r.json()
        import base64

        if data.get("encoding") == "base64" and data.get("content"):
            raw = base64.b64decode(data["content"].replace("\n", ""))
            text = raw.decode("utf-8", errors="replace")
            return text[:8000] if len(text) > 8000 else text
        return str(data)[:4000]

    return f"Unknown GitHub tool: {name}"
