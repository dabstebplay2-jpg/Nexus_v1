"""Скачивание временных URL изображений RouterAI → data URL для хранения в чате."""
from __future__ import annotations

import base64
import io
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 8_000_000
MAX_DATA_URL_CHARS = 3_500_000
DOWNLOAD_TIMEOUT = httpx.Timeout(60.0, read=60.0)
STORAGE_MAX_DIMENSION = 1536
STORAGE_JPEG_QUALITY = 88


def _compress_for_storage(data: bytes) -> tuple[bytes, str]:
    """Уменьшает PNG/WebP до JPEG — нельзя обрезать base64 посередине."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data))
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((STORAGE_MAX_DIMENSION, STORAGE_MAX_DIMENSION), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=STORAGE_JPEG_QUALITY, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as exc:
        logger.warning("image compress skipped: %s", exc)
        mime = "image/png"
        return data, mime


def _as_data_url(content: bytes, content_type: str | None) -> str:
    mime = (content_type or "image/jpeg").split(";")[0].strip() or "image/jpeg"
    if len(content) > 80_000 or mime not in ("image/jpeg", "image/jpg"):
        content, mime = _compress_for_storage(content)
    b64 = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{b64}"


def materialize_image_dict(img: dict[str, Any]) -> dict[str, str]:
    """Если уже data URL — вернуть как есть; иначе оставить url без изменений (sync helper)."""
    url = img.get("url") or ""
    data_url = img.get("dataUrl") or img.get("data_url")
    if isinstance(data_url, str) and data_url.startswith("data:"):
        return {"url": data_url, "dataUrl": data_url}
    if url.startswith("data:"):
        return {"url": url, "dataUrl": url}
    return {"url": url}


async def materialize_image_url(url: str) -> dict[str, str]:
    """
    HTTP(S) URL → { url, dataUrl } с data:image/...;base64,...
  При ошибке или лимите — исходный url.
    """
    if not url:
        return {"url": ""}
    if url.startswith("data:"):
        if len(url) > MAX_DATA_URL_CHARS:
            logger.warning("incoming data URL too large (%s chars), skip inline", len(url))
            return {"url": url}
        return {"url": url, "dataUrl": url}

    try:
        async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.content
            if len(data) > MAX_IMAGE_BYTES:
                logger.warning("image_materialize: too large %s bytes", len(data))
                return {"url": url}
            data_url = _as_data_url(data, res.headers.get("content-type"))
            if len(data_url) > MAX_DATA_URL_CHARS:
                logger.warning("image_materialize: data URL too long")
                return {"url": url}
            return {"url": data_url, "dataUrl": data_url}
    except Exception as exc:
        logger.warning("image_materialize failed for %s: %s", url[:80], exc)
        return {"url": url}


async def materialize_image_list(images: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for img in images:
        raw_url = img.get("url") or ""
        if not raw_url or raw_url in seen:
            continue
        seen.add(raw_url)
        if raw_url.startswith("data:") or img.get("dataUrl"):
            out.append(materialize_image_dict(img))
            continue
        out.append(await materialize_image_url(raw_url))
    return out
