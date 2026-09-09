#!/usr/bin/env python3
"""Trigger Render deploy only (no env sync)."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
API_BASE = "https://api.render.com/v1"
SERVICE_NAME = "nexus-cloud"


def _parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else {"status": resp.status}


def main() -> int:
    local = _parse_env(ENV_FILE)
    import os

    token = (os.environ.get("RENDER_API_KEY") or local.get("RENDER_API_KEY") or "").strip()
    if not token:
        print("RENDER_API_KEY missing in .env or environment")
        return 1
    name = local.get("RENDER_SERVICE_NAME", SERVICE_NAME)
    data = _api("GET", f"/services?name={name}&limit=20", token)
    service_id = None
    for item in data:
        svc = item.get("service") or item
        if (svc.get("name") or "").lower() == name.lower():
            service_id = svc["id"]
            break
    if not service_id:
        print(f"Service '{name}' not found")
        return 1
    dep = _api("POST", f"/services/{service_id}/deploys", token, {"clearCache": "do_not_clear"})
    dep_id = dep.get("id") if isinstance(dep, dict) else dep
    print(f"Deploy triggered for {name}: {dep_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
