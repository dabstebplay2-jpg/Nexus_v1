#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from upstash_redis import Redis  # noqa: E402

from scripts.push_render_env import ENV_FILE, _parse_env  # noqa: E402

email = (sys.argv[1] if len(sys.argv) > 1 else "dabstebplay@gmail.com").strip().lower()
local = _parse_env(ENV_FILE)
r = Redis(url=local["UPSTASH_REDIS_REST_URL"], token=local["UPSTASH_REDIS_REST_TOKEN"])
raw = r.get("nexus:v1:db_snapshot")
data = json.loads(raw) if isinstance(raw, str) else raw
for u in data.get("users") or []:
    if (u.get("email") or "").lower() == email:
        gs = u.get("google_sub") or ""
        print("email:", u["email"])
        print("google_sub_prefix:", gs[:20] if gs else "(none)")
        print("stale_goog999new:", gs.startswith("goog999new"))
        sys.exit(0)
print("user not found")
