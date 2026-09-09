#!/usr/bin/env python3
"""Регистрация webhook Telegram → Nexus Cloud API."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_root))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_root.parent / ".env")
load_dotenv(_root / ".env", override=True)

TOKEN = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
SECRET = (os.environ.get("TELEGRAM_WEBHOOK_SECRET") or "").strip()
BASE = (
    os.environ.get("NEXUS_CLOUD_PUBLIC_URL")
    or os.environ.get("TELEGRAM_WEBHOOK_BASE")
    or "https://nexus-cloud-bxcc.onrender.com"
).rstrip("/")
WEBHOOK_URL = f"{BASE}/v1/telegram/webhook"


def api(method: str, **params) -> dict:
    if not TOKEN:
        print("TELEGRAM_BOT_TOKEN не задан", file=sys.stderr)
        sys.exit(1)
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    if params:
        data = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(url, data=data, method="POST")
    else:
        req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode())


def main() -> None:
    action = (sys.argv[1] if len(sys.argv) > 1 else "set").lower()
    if action == "info":
        print(json.dumps(api("getWebhookInfo"), ensure_ascii=False, indent=2))
        return

    if action == "delete":
        print(json.dumps(api("deleteWebhook"), ensure_ascii=False, indent=2))
        return

    if action == "commands":
        commands = json.dumps(
            [
                {"command": "login", "description": "Войти на сайт Nexus"},
                {"command": "balance", "description": "Пул подписки и баланс"},
                {"command": "profile", "description": "Тариф и аккаунт"},
                {"command": "tariffs", "description": "Тарифы и ссылка на оплату"},
                {"command": "model", "description": "Выбор модели ИИ"},
                {"command": "image", "description": "Сгенерировать картинку"},
            ],
            ensure_ascii=False,
        )
        print(json.dumps(api("setMyCommands", commands=commands), ensure_ascii=False, indent=2))
        return

    payload = {"url": WEBHOOK_URL, "drop_pending_updates": "true"}
    if SECRET:
        payload["secret_token"] = SECRET
    print(f"setWebhook -> {WEBHOOK_URL}")
    result = api("setWebhook", **payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get("ok"):
        print(json.dumps(api("getWebhookInfo"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
