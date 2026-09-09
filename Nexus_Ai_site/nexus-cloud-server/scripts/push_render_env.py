#!/usr/bin/env python3
"""Синхронизация .env → Render (нужен RENDER_API_KEY в .env или окружении)."""

from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
SERVICE_NAME = os.environ.get("RENDER_SERVICE_NAME", "nexus-cloud")
API_BASE = "https://api.render.com/v1"

# Переменные для продакшен Web-сервиса (без локальной админки)
RENDER_KEYS = [
    "POLZA_BACKEND_API_KEY",
    "POLZA_MCP_TOKEN",
    "POLZA_OAUTH_CALLBACK_URL",
    "POLZA_APP_NAME",
    "DISCORD_OPS_WEBHOOK_URL",
    "NEXUS_CRON_SECRET",
    "NEXUS_CLOUD_SECRET_KEY",
    "NEXUS_CLOUD_DATABASE_URL",
    "NEXUS_CORS_ORIGINS",
    "NEXUS_EMAIL_AUTH_ENABLED",
    "NEXUS_BILLING_TEST_MODE",
    "NEXUS_TESTING_MODE",
    "NEXUS_REMOTE_ADMIN",
    "NEXUS_ADMIN_PASSWORD",
    "NEXUS_ADMIN_GRANT_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "YOOKASSA_SHOP_ID",
    "YOOKASSA_SECRET_KEY",
    "YOOKASSA_RETURN_PATH",
    "NEXUS_PROMO_CODES_ENABLED",
    "NEXUS_FRONTEND_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "NEXUS_AUTH_DEV_LOG_CODES",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_BOT_USERNAME",
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
    "OPENROUTER_HTTP_REFERER",
    "OPENROUTER_APP_TITLE",
    "NEXUS_FREE_OPENROUTER_DAILY_LIMIT",
    "NEXUS_FREE_OPENROUTER_RPM",
]

DEFAULTS = {
    "POLZA_OAUTH_CALLBACK_URL": "https://nexus-cloud-bxcc.onrender.com/v1/auth/polza/callback",
    "POLZA_APP_NAME": "Nexus",
    "NEXUS_CORS_ORIGINS": "https://nexus-zeta-ruby-12.vercel.app,https://nexus-ide.vercel.app",
    "NEXUS_FRONTEND_URL": "https://nexus-zeta-ruby-12.vercel.app",
    "GOOGLE_REDIRECT_URI": "https://nexus-cloud-bxcc.onrender.com/v1/auth/google/callback",
    "NEXUS_EMAIL_AUTH_ENABLED": "false",
    "NEXUS_BILLING_TEST_MODE": "false",
    "NEXUS_PROMO_CODES_ENABLED": "false",
    "NEXUS_TESTING_MODE": "false",
    "NEXUS_REMOTE_ADMIN": "true",
    "NEXUS_LOCAL_ADMIN": "false",
    "OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1",
    "OPENROUTER_HTTP_REFERER": "https://nexus-zeta-ruby-12.vercel.app",
    "OPENROUTER_APP_TITLE": "Nexus",
    "NEXUS_FREE_OPENROUTER_DAILY_LIMIT": "100",
    "NEXUS_FREE_OPENROUTER_RPM": "15",
    "YOOKASSA_RETURN_PATH": "/pricing",
}

_WEAK_SECRET_MARKERS = (
    "change-me",
    "nexus-dev-change-me",
    "super_secret_nexus",
)


def _is_weak_secret(value: str) -> bool:
    s = (value or "").strip()
    if len(s) < 32:
        return True
    lower = s.lower()
    return any(m in lower for m in _WEAK_SECRET_MARKERS)


def _parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def _api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _find_service_id(token: str, name: str) -> str:
    cursor = ""
    while True:
        q = f"?name={name}&limit=20"
        if cursor:
            q += f"&cursor={cursor}"
        data = _api("GET", f"/services{q}", token)
        for item in data:
            svc = item.get("service") or item
            if (svc.get("name") or "").lower() == name.lower():
                return svc["id"]
            slug = (svc.get("slug") or "").lower()
            if name.lower() in slug:
                return svc["id"]
        cursor = data[-1].get("cursor") if isinstance(data, list) and data else ""
        if not cursor:
            break
    raise SystemExit(f"Render service '{name}' not found. Check RENDER_SERVICE_NAME.")


def _put_env(token: str, service_id: str, key: str, value: str) -> None:
    body = {"value": value}
    path = f"/services/{service_id}/env-vars/{key}"
    try:
        _api("PUT", path, token, body)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            _api("POST", f"/services/{service_id}/env-vars", token, {"envVarKey": key, "value": value})
        else:
            err = exc.read().decode() if exc.fp else str(exc)
            raise SystemExit(f"Render env {key} failed ({exc.code}): {err}") from exc


def main() -> int:
    local = _parse_env(ENV_FILE)
    token = (os.environ.get("RENDER_API_KEY") or local.get("RENDER_API_KEY") or "").strip()
    if not token:
        print("RENDER_API_KEY missing. Add to .env from https://dashboard.render.com/u/settings#api-keys")
        return 1

    allow_rotate = (local.get("RENDER_ALLOW_SECRET_ROTATION") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )

    payload: dict[str, str] = {}
    for key in RENDER_KEYS:
        val = local.get(key) or DEFAULTS.get(key, "")
        if not val and key in (
            "POLZA_BACKEND_API_KEY",
            "POLZA_MCP_TOKEN",
            "UPSTASH_REDIS_REST_URL",
            "UPSTASH_REDIS_REST_TOKEN",
            "DISCORD_OPS_WEBHOOK_URL",
            "NEXUS_CRON_SECRET",
        ):
            print(f"WARN: {key} empty in .env — skip")
            continue
        if val:
            payload[key] = val

    if not payload.get("NEXUS_ADMIN_PASSWORD"):
        payload["NEXUS_ADMIN_PASSWORD"] = local.get("NEXUS_ADMIN_PASSWORD", "")

    cloud_secret = payload.get("NEXUS_CLOUD_SECRET_KEY", "")
    if _is_weak_secret(cloud_secret):
        if allow_rotate:
            payload["NEXUS_CLOUD_SECRET_KEY"] = secrets.token_urlsafe(48)
            print("Rotated NEXUS_CLOUD_SECRET_KEY for Render (update local .env manually).")
        else:
            payload.pop("NEXUS_CLOUD_SECRET_KEY", None)
            print(
                "WARN: weak NEXUS_CLOUD_SECRET_KEY in .env — skip sync "
                "(set RENDER_ALLOW_SECRET_ROTATION=true to rotate on Render)."
            )

    grant = payload.get("NEXUS_ADMIN_GRANT_KEY", "") or local.get("NEXUS_ADMIN_GRANT_KEY", "")
    if not grant or len(grant) < 32:
        if allow_rotate:
            payload["NEXUS_ADMIN_GRANT_KEY"] = secrets.token_urlsafe(48)
            print("Generated NEXUS_ADMIN_GRANT_KEY for Render (save to .env for grant_tier.py).")
        else:
            payload.pop("NEXUS_ADMIN_GRANT_KEY", None)
            print("WARN: NEXUS_ADMIN_GRANT_KEY missing/short — skip sync.")

    if len(payload.get("NEXUS_ADMIN_PASSWORD", "")) < 12:
        raise SystemExit(
            "NEXUS_ADMIN_PASSWORD must be at least 12 characters in .env before deploying to Render."
        )

    payload["NEXUS_LOCAL_ADMIN"] = "false"
    payload["NEXUS_REMOTE_ADMIN"] = "true"

    if payload.get("UPSTASH_REDIS_REST_URL") and payload.get("UPSTASH_REDIS_REST_TOKEN"):
        payload.pop("NEXUS_CLOUD_DATABASE_URL", None)

    print(f"Sync {len(payload)} env vars to Render service '{SERVICE_NAME}'...")
    service_id = _find_service_id(token, SERVICE_NAME)
    for k, v in sorted(payload.items()):
        _put_env(token, service_id, k, v)
        print(f"  OK {k}")

    try:
        _api("POST", f"/services/{service_id}/deploys", token, {"clearCache": "do_not_clear"})
        print("Deploy triggered.")
    except Exception as exc:
        print(f"Deploy trigger failed (redeploy manually): {exc}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
