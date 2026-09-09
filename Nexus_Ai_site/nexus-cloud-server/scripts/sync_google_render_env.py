#!/usr/bin/env python3
"""Sync only GOOGLE_* from .env to Render (does not rotate NEXUS_CLOUD_SECRET_KEY)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from push_render_env import (  # noqa: E402
    ENV_FILE,
    SERVICE_NAME,
    _api,
    _find_service_id,
    _parse_env,
    _put_env,
)

GOOGLE_KEYS = (
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "NEXUS_FRONTEND_URL",
)


def main() -> int:
    import os

    local = _parse_env(ENV_FILE)
    token = (os.environ.get("RENDER_API_KEY") or local.get("RENDER_API_KEY") or "").strip()
    if not token:
        print("RENDER_API_KEY missing")
        return 1
    service_id = _find_service_id(token, SERVICE_NAME)
    for key in GOOGLE_KEYS:
        val = (local.get(key) or "").strip()
        if not val:
            print(f"SKIP {key} (empty)")
            continue
        _put_env(token, service_id, key, val)
        suffix = val[-24:] if len(val) > 24 else val
        print(f"OK {key} …{suffix}")
    try:
        _api("POST", f"/services/{service_id}/deploys", token, {"clearCache": "do_not_clear"})
        print("Deploy triggered.")
    except Exception as exc:
        print(f"Deploy trigger: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
