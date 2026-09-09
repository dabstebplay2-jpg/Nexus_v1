#!/usr/bin/env python3
"""Clear known test google_sub values so the next Google login can relink."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from upstash_redis import Redis  # noqa: E402

from scripts.push_render_env import ENV_FILE, _parse_env  # noqa: E402

STALE_PREFIXES = ("goog999new",)


def main() -> int:
    email_filter = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    local = _parse_env(ENV_FILE)
    r = Redis(url=local["UPSTASH_REDIS_REST_URL"], token=local["UPSTASH_REDIS_REST_TOKEN"])
    raw = r.get("nexus:v1:db_snapshot")
    if not raw:
        print("No snapshot")
        return 1
    data = json.loads(raw) if isinstance(raw, str) else raw
    changed = 0
    for u in data.get("users") or []:
        em = (u.get("email") or "").lower()
        if email_filter and em != email_filter:
            continue
        gs = u.get("google_sub") or ""
        if gs and any(gs.startswith(p) for p in STALE_PREFIXES):
            print(f"Clear google_sub for {em} (was {gs[:16]}…)")
            u["google_sub"] = None
            changed += 1
    if not changed:
        print("No stale google_sub found")
        return 0
    r.set("nexus:v1:db_snapshot", json.dumps(data, ensure_ascii=False))
    print(f"Updated snapshot ({changed} user(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
