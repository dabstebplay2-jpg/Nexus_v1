#!/usr/bin/env python3
"""Smoke-тест прод Render API. Запуск: python scripts/smoke_test_render.py [BASE_URL]"""

import json
import sys
import urllib.error
import urllib.request
from uuid import uuid4

DEFAULT_BASE = "https://nexus-cloud-bxcc.onrender.com"


def req(method: str, url: str, body=None, headers=None):
    data = None
    h = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = raw
        return e.code, detail


def ok(name: str, cond: bool, extra: str = ""):
    status = "OK" if cond else "FAIL"
    print(f"  [{status}] {name}" + (f" — {extra}" if extra else ""))
    return cond


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE).rstrip("/")
    print(f"Smoke test: {base}\n")
    passed = 0
    total = 0

    def check(name, cond, extra=""):
        nonlocal passed, total
        total += 1
        if ok(name, cond, extra):
            passed += 1

    code, data = req("GET", f"{base}/v1/health")
    check("GET /v1/health", code == 200 and data.get("status") == "ok", str(data))

    code, data = req("GET", f"{base}/v1/billing/catalog")
    check(
        "GET /v1/billing/catalog",
        code == 200 and isinstance(data.get("tiers"), list) and len(data["tiers"]) > 0,
        f"tiers={len(data.get('tiers', []))}",
    )

    email = f"smoke.{uuid4().hex[:12]}@gmail.com"
    password = "SmokeTestPass123!"
    code, data = req(
        "POST",
        f"{base}/v1/auth/register",
        {"email": email, "password": password, "tier": "FREE"},
    )
    check("POST /v1/auth/register", code == 200 and "access_token" in data, f"code={code}")

    if code != 200:
        print("\nStopped: register failed")
        print(f"Passed {passed}/{total}")
        return 1

    token = data["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    code, profile = req("GET", f"{base}/v1/auth/profile", headers=auth)
    check(
        "GET /v1/auth/profile",
        code == 200 and profile.get("email") == email,
        profile.get("subscription_tier", ""),
    )

    code, models = req("GET", f"{base}/v1/ai/models", headers=auth)
    model_list = models.get("models") or []
    check(
        "GET /v1/ai/models",
        code == 200 and len(model_list) > 0,
        f"models={len(model_list)}",
    )

    code, agents = req("GET", f"{base}/v1/ai/agents", headers=auth)
    check(
        "GET /v1/ai/agents",
        code == 200 and len(agents.get("agents") or []) > 0,
        f"agents={len(agents.get('agents') or [])}",
    )

    # CORS preflight (как браузер с Vercel)
    cors_origin = "https://nexus-zeta-ruby-12.vercel.app"
    cors_req = urllib.request.Request(
        f"{base}/v1/health",
        method="OPTIONS",
        headers={
            "Origin": cors_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    try:
        with urllib.request.urlopen(cors_req, timeout=30) as resp:
            acao = resp.headers.get("Access-Control-Allow-Origin", "")
            cors_ok = cors_origin in acao or acao == "*"
            check("CORS preflight (Vercel origin)", cors_ok, f"Allow-Origin={acao!r}")
    except urllib.error.HTTPError as e:
        check("CORS preflight (Vercel origin)", False, f"HTTP {e.code}")

    print(f"\nPassed {passed}/{total}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
