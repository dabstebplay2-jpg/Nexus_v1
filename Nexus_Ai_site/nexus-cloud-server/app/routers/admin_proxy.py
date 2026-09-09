"""Прокси админки: UI на localhost -> Render без CORS."""

from __future__ import annotations

import gzip
import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from app.config import NEXUS_ADMIN_DEFAULT_CLOUD_URL, NEXUS_LOCAL_ADMIN

logger = logging.getLogger("app.admin_proxy")

PROXY_VERSION = "2.2"

router = APIRouter(prefix="/v1/admin-cloud-proxy", tags=["admin-proxy"])


def _admin_upstream_urls(target: str) -> tuple[str, str]:
    """Пары URL: health и база local-admin (без слэша в конце).

    Render: https://host → /v1/health и /v1/local-admin
    Vercel (как сайт): https://host.vercel.app/api → /api/health → cloud /v1/health
    """
    base = target.strip().rstrip("/")
    if base.endswith("/api"):
        return f"{base}/health", f"{base}/local-admin"
    return f"{base}/v1/health", f"{base}/v1/local-admin"

_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "content-encoding",
    "accept-encoding",
}


def _body_diagnostics(data: bytes, upstream: httpx.Response) -> dict[str, Any]:
    enc = (upstream.headers.get("content-encoding") or "").strip() or "(нет)"
    ctype = (upstream.headers.get("content-type") or "").strip() or "(нет)"
    preview = data[:120].decode("utf-8", errors="replace").replace("\n", " ").replace("\r", " ")
    return {
        "body_bytes": len(data),
        "content_type": ctype,
        "content_encoding_header": enc,
        "starts_with_gzip_magic": len(data) >= 2 and data[:2] == b"\x1f\x8b",
        "starts_with_json": bool(data[:1] in (b"{", b"[")),
        "body_hex_first_16": data[:16].hex() if data else "",
        "body_preview": preview,
    }


def _decode_upstream_body(upstream: httpx.Response) -> tuple[bytes, dict[str, Any]]:
    """Распаковка тела; возвращает байты и шаги декодирования для логов."""
    steps: list[str] = []
    data = upstream.content or b""
    steps.append(f"raw_len={len(data)}")

    if data[:2] == b"\x1f\x8b":
        steps.append("detected_gzip_magic")
        try:
            data = gzip.decompress(data)
            steps.append(f"gzip_decompressed_len={len(data)}")
        except OSError as exc:
            steps.append(f"gzip_failed={exc}")

    enc = (upstream.headers.get("content-encoding") or "").lower()
    if enc == "br" and data[:1] not in (b"{", b"["):
        try:
            import brotli  # type: ignore

            data = brotli.decompress(data)
            steps.append(f"brotli_decompressed_len={len(data)}")
        except ImportError:
            steps.append("brotli_skip_no_module")
        except Exception as exc:
            steps.append(f"brotli_failed={exc}")

    return data, {"decode_steps": steps}


def _proxy_error(
    code: str,
    message: str,
    *,
    target: str,
    url: str,
    upstream: httpx.Response | None = None,
    raw_bytes: bytes | None = None,
    extra: dict[str, Any] | None = None,
) -> HTTPException:
    diag: dict[str, Any] = {
        "proxy_version": PROXY_VERSION,
        "target_base": target,
        "upstream_url": url,
    }
    if upstream is not None:
        diag["upstream_status"] = upstream.status_code
        diag.update(_body_diagnostics(raw_bytes or b"", upstream))
    if extra:
        diag.update(extra)
    logger.error(
        "admin_proxy %s | %s | status=%s | diag=%s",
        code,
        message,
        upstream.status_code if upstream else "—",
        diag,
    )
    return HTTPException(
        status_code=502,
        detail={
            "error": code,
            "message": message,
            "diagnostics": diag,
        },
    )


@router.get("/health", include_in_schema=False)
async def proxy_health(request: Request) -> dict[str, Any]:
    """Проверка локального прокси (без пароля)."""
    if not NEXUS_LOCAL_ADMIN:
        raise HTTPException(status_code=404, detail="Admin proxy disabled")
    target = (request.headers.get("X-Cloud-Admin-Target") or NEXUS_ADMIN_DEFAULT_CLOUD_URL or "").strip().rstrip("/")
    out: dict[str, Any] = {
        "proxy_version": PROXY_VERSION,
        "local_admin": True,
        "default_cloud_url": NEXUS_ADMIN_DEFAULT_CLOUD_URL,
        "target": target or None,
        "cloud_reachable": False,
        "cloud_admin_api": False,
    }
    if not target:
        out["hint"] = "Укажите Server API на форме входа или NEXUS_ADMIN_DEFAULT_CLOUD_URL в .env"
        return out
    health_url, admin_base = _admin_upstream_urls(target)
    out["health_url"] = health_url
    out["admin_base"] = admin_base
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            h = await client.get(health_url, headers={"Accept-Encoding": "identity"})
            out["cloud_reachable"] = h.status_code == 200
            out["cloud_health_status"] = h.status_code
            s = await client.get(
                f"{admin_base}/status",
                headers={"Accept-Encoding": "identity", "X-Admin-Password": "__probe__"},
            )
            out["cloud_admin_status"] = s.status_code
            out["cloud_admin_api"] = s.status_code != 404
            if s.status_code == 401:
                out["cloud_admin_api"] = True
                out["hint"] = "Админ-API на Render доступен (нужен верный пароль)"
            elif s.status_code == 404:
                out["hint"] = "На Render: NEXUS_REMOTE_ADMIN=true, NEXUS_ADMIN_PASSWORD, Manual Deploy"
    except httpx.RequestError as exc:
        out["cloud_error"] = str(exc)
        out["hint"] = f"Не удалось открыть {target}: {exc}"
    return out


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_cloud_admin(path: str, request: Request) -> Response:
    if not NEXUS_LOCAL_ADMIN:
        raise HTTPException(status_code=404, detail="Admin proxy disabled")

    target = (request.headers.get("X-Cloud-Admin-Target") or NEXUS_ADMIN_DEFAULT_CLOUD_URL or "").strip().rstrip("/")
    if not target:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "missing_target",
                "message": "Укажите URL Render в поле «Server API»",
                "diagnostics": {"proxy_version": PROXY_VERSION},
            },
        )

    _, admin_base = _admin_upstream_urls(target)
    url = f"{admin_base}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    forward_headers: dict[str, str] = {
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    }
    for key, value in request.headers.items():
        lk = key.lower()
        if lk in _HOP_HEADERS:
            continue
        if lk.startswith("x-cloud-admin-target"):
            continue
        forward_headers[key] = value

    body = await request.body()
    logger.info(
        "admin_proxy → %s %s | target=%s | body=%s bytes",
        request.method,
        path,
        target,
        len(body),
    )

    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            upstream = await client.request(
                request.method,
                url,
                headers=forward_headers,
                content=body if body else None,
            )
    except httpx.RequestError as exc:
        logger.exception("admin_proxy network error url=%s", url)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "cloud_unreachable",
                "message": f"Не удалось связаться с облаком ({target}): {exc}",
                "diagnostics": {
                    "proxy_version": PROXY_VERSION,
                    "upstream_url": url,
                    "hint": "Проверьте URL Render и что сервис не «спит» (Free tier)",
                },
            },
        ) from exc

    logger.info(
        "admin_proxy ← %s | upstream_status=%s | ctype=%s | enc=%s | len=%s",
        path,
        upstream.status_code,
        upstream.headers.get("content-type"),
        upstream.headers.get("content-encoding"),
        len(upstream.content or b""),
    )

    if upstream.status_code == 404 and path == "status":
        raise _proxy_error(
            "admin_api_not_deployed",
            "Админ-API не найден на Render. Включите NEXUS_REMOTE_ADMIN=true и "
            "NEXUS_ADMIN_PASSWORD, затем Manual Deploy.",
            target=target,
            url=url,
            upstream=upstream,
            raw_bytes=upstream.content,
            extra={"hint": "GET /v1/local-admin/status вернул 404"},
        )

    raw_bytes, decode_info = _decode_upstream_body(upstream)
    text = raw_bytes.decode("utf-8", errors="replace").strip()

    if not text:
        return Response(content=b"", status_code=upstream.status_code, media_type="application/json")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        diag = _body_diagnostics(raw_bytes, upstream)
        diag.update(decode_info)
        if diag.get("starts_with_gzip_magic"):
            hint = (
                "Ответ похож на сжатый gzip (бинарный мусор в браузере). "
                "Остановите старый uvicorn на порту 8787, запустите .\\scripts\\start_local_admin.ps1 (порт 8790) и Ctrl+F5."
            )
        elif diag.get("upstream_status") == 401:
            hint = "Неверный NEXUS_ADMIN_PASSWORD (должен совпадать с Render)"
        else:
            hint = "Ожидался JSON. Возможно HTML-ошибка Render или устаревший локальный сервер."

        logger.warning(
            "admin_proxy json_error path=%s | %s | decode=%s | preview=%r",
            path,
            exc,
            decode_info,
            diag.get("body_preview"),
        )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "invalid_upstream_json",
                "message": "Облако вернуло не JSON. См. diagnostics и консоль браузера (F12).",
                "diagnostics": {
                    "proxy_version": PROXY_VERSION,
                    "target_base": target,
                    "upstream_url": url,
                    "upstream_status": upstream.status_code,
                    "json_error": str(exc),
                    "hint": hint,
                    **diag,
                    **decode_info,
                },
            },
        ) from exc

    return JSONResponse(content=payload, status_code=upstream.status_code)
