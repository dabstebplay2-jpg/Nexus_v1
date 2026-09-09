"""Выбранная модель чата для Telegram (Redis или память)."""

from __future__ import annotations

import logging
import time

from app.config import redis_persistence_enabled

logger = logging.getLogger(__name__)

_MODEL_PREFIX = "nexus:v1:tg_model:"
_mem_models: dict[int, tuple[str, float]] = {}
_MEM_TTL_SEC = 86400 * 30


def _redis():
    from app.services.redis_sync import _redis_client

    return _redis_client()


def get_selected_model(telegram_id: int) -> str | None:
    tid = int(telegram_id)
    if redis_persistence_enabled():
        try:
            raw = _redis().get(f"{_MODEL_PREFIX}{tid}")
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            if raw:
                return str(raw).strip() or None
        except Exception as exc:
            logger.warning("Redis tg model get failed: %s", exc)

    entry = _mem_models.get(tid)
    if entry and entry[1] > time.time():
        return entry[0]
    return None


def set_selected_model(telegram_id: int, model_id: str) -> None:
    tid = int(telegram_id)
    model_id = (model_id or "").strip()
    if not model_id:
        return

    if redis_persistence_enabled():
        try:
            client = _redis()
            try:
                client.setex(f"{_MODEL_PREFIX}{tid}", _MEM_TTL_SEC, model_id)
            except TypeError:
                client.set(f"{_MODEL_PREFIX}{tid}", model_id, ex=_MEM_TTL_SEC)
            return
        except Exception as exc:
            logger.warning("Redis tg model set failed: %s", exc)

    _mem_models[tid] = (model_id, time.time() + _MEM_TTL_SEC)
