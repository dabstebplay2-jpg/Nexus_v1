import asyncio
import json
import os
from contextvars import ContextVar

import httpx
from fastapi import HTTPException

from app.config import CLOUD_SERVER_URL, CONFIG_FILE_PATH, HTTPX_CLIENT_KWARGS

refresh_lock = asyncio.Lock()
_request_bearer: ContextVar[str] = ContextVar("request_bearer", default="")


def set_request_bearer(token: str):
    return _request_bearer.set((token or "").strip())


def reset_request_bearer(tok):
    _request_bearer.reset(tok)


def _bearer_from_context() -> str:
    raw = _request_bearer.get()
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return raw


def save_tokens_locally(access_token: str, refresh_token: str):
    try:
        fd = os.open(CONFIG_FILE_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"access_token": access_token, "refresh_token": refresh_token}, f)
    except Exception:
        with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump({"access_token": access_token, "refresh_token": refresh_token}, f)


def get_local_tokens():
    ctx = _bearer_from_context()
    if ctx:
        return ctx, ""
    if not os.path.exists(CONFIG_FILE_PATH):
        return "", ""
    try:
        with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("access_token", ""), data.get("refresh_token", "")
    except Exception:
        return "", ""


def delete_local_tokens():
    if os.path.exists(CONFIG_FILE_PATH):
        try:
            os.remove(CONFIG_FILE_PATH)
        except Exception:
            pass


async def cloud_request(
    method: str, path: str, json_data: dict = None, params: dict = None
) -> httpx.Response:
    access_token, refresh_token = get_local_tokens()
    headers = {}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
    timeout = httpx.Timeout(30.0, connect=3.0)

    async with httpx.AsyncClient(
        limits=limits, timeout=timeout, **HTTPX_CLIENT_KWARGS
    ) as client:
        url = f"{CLOUD_SERVER_URL}{path}"
        try:
            res = await client.request(method, url, headers=headers, json=json_data, params=params)
        except (httpx.ConnectError, httpx.ConnectTimeout):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Cloud не отвечает на http://127.0.0.1:8080. "
                    "Запустите nexus.bat cloud или nexus.bat stop, затем nexus.bat start. "
                    "В окне Cloud должно быть: Uvicorn running on 8080 (без ошибки 10048)."
                ),
            )

        # 401 только на /v1/auth/* — сброс сессии; для /v1/ai/* не трогаем токены (часто это ошибка провайдера).
        auth_path = path.startswith("/v1/auth")

        if res.status_code == 401 and auth_path and not refresh_token:
            delete_local_tokens()

        if res.status_code == 401 and refresh_token:
            async with refresh_lock:
                current_access, current_refresh = get_local_tokens()

                if current_access == access_token:
                    try:
                        refresh_res = await client.post(
                            f"{CLOUD_SERVER_URL}/v1/auth/refresh",
                            json={"refresh_token": current_refresh},
                        )
                        if refresh_res.status_code == 200:
                            token_data = refresh_res.json()
                            access_token = token_data.get("access_token")
                            refresh_token = token_data.get("refresh_token", current_refresh)
                            save_tokens_locally(access_token, refresh_token)
                        else:
                            if auth_path:
                                delete_local_tokens()
                            raise HTTPException(
                                status_code=401,
                                detail="Сессия авторизации истекла. Требуется повторный вход.",
                            )
                    except HTTPException:
                        raise
                    except Exception:
                        if auth_path:
                            delete_local_tokens()
                        raise HTTPException(
                            status_code=401,
                            detail="Не удалось продлить сессию авторизации.",
                        )
                else:
                    access_token = current_access

                headers["Authorization"] = f"Bearer {access_token}"
                res = await client.request(method, url, headers=headers, json=json_data, params=params)

        return res
