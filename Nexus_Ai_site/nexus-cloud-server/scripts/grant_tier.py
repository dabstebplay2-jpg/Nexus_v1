#!/usr/bin/env python3
"""Выдать тариф пользователю на проде. Пример:
  python scripts/grant_tier.py user@example.com ULTRA
Env: NEXUS_ADMIN_GRANT_KEY (на Render и в локальном .env), опционально NEXUS_CLOUD_BASE_URL
"""

import json
import os
import sys
import urllib.request

BASE = os.environ.get("NEXUS_CLOUD_BASE_URL", "https://nexus-cloud-bxcc.onrender.com").rstrip("/")


def _read_env_var(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if val:
        return val
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.isfile(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    email = sys.argv[1] if len(sys.argv) > 1 else ""
    tier = sys.argv[2] if len(sys.argv) > 2 else "ULTRA"
    if not email:
        print("Usage: python scripts/grant_tier.py <email> [tier]", file=sys.stderr)
        return 2

    grant_key = _read_env_var("NEXUS_ADMIN_GRANT_KEY")
    if not grant_key or len(grant_key) < 32:
        print(
            "Set NEXUS_ADMIN_GRANT_KEY (32+ chars) in .env and on Render. "
            "Do not use ROUTER_AI_MASTER_KEY for HTTP auth.",
            file=sys.stderr,
        )
        return 1

    body = json.dumps({"email": email, "tier": tier}).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/internal/grant-tier",
        data=body,
        headers={"Content-Type": "application/json", "X-Grant-Key": grant_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            print(resp.read().decode())
            return 0
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
