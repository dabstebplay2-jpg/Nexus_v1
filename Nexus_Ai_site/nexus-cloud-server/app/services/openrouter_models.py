"""Каталог бесплатных моделей OpenRouter для тарифа FREE."""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any

from app.config import OPENROUTER_BASE_URL, openrouter_free_tier_enabled
from app.services.openrouter import OpenRouterService
from app.tiers import normalize_tier

logger = logging.getLogger(__name__)

FREE_CACHE_TTL = int(os.environ.get("NEXUS_OPENROUTER_MODELS_CACHE_TTL", "1800"))
DEFAULT_FREE_MODEL = "openrouter/free"

_SKIP_ID_PARTS = re.compile(
    r"(embed|embedding|moderation|tts|whisper)",
    re.I,
)

_cache: dict[str, Any] = {
    "fetched_at": 0.0,
    "chat_models": [],
    "research_models": [],
    "media_models": [],
    "by_id": {},
}


def _default_free_router() -> dict:
    """Надёжный резерв: OpenRouter сам выбирает доступную бесплатную модель."""
    return {
        "id": DEFAULT_FREE_MODEL,
        "name": "OpenRouter Free Router",
        "provider": "Openrouter",
        "description": "Автовыбор доступной бесплатной модели OpenRouter.",
        "context_k": 32,
        "created": 0,
        "multimodal": False,
        "supports_vision": False,
        "supports_image_gen": False,
        "supports_tools": True,
        "price_1m_usd": 0.0,
        "pricing": {"prompt": 0, "completion": 0},
        "min_tier": "FREE",
        "cost_segment": "cheap",
        "cost_segment_label": "Бесплатно",
        "source": "openrouter",
    }


def _parse_price(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def is_zero_price_model(raw: dict) -> bool:
    pricing = raw.get("pricing") or {}
    return (
        _parse_price(pricing.get("prompt")) == 0
        and _parse_price(pricing.get("completion")) == 0
        and _parse_price(pricing.get("request")) == 0
    )


def _is_chat_model(raw: dict) -> bool:
    mid = (raw.get("id") or "").lower()
    if not mid:
        return False
    if _SKIP_ID_PARTS.search(mid):
        return False
    if raw.get("expiration_date"):
        return False
    arch = raw.get("architecture") or {}
    outputs = arch.get("output_modalities") or []
    if outputs and "text" not in outputs:
        return False
    modality = (arch.get("modality") or "").lower()
    if modality and "text" not in modality:
        return False
    return True


def _supports_tools(raw: dict) -> bool:
    params = raw.get("supported_parameters") or []
    return "tools" in params or "tool_choice" in params


def _normalize(raw: dict) -> dict:
    pricing = raw.get("pricing") or {}
    prompt = _parse_price(pricing.get("prompt"))
    completion = _parse_price(pricing.get("completion"))
    provider = (raw.get("id") or "").split("/")[0] if "/" in (raw.get("id") or "") else "openrouter"
    ctx = int(raw.get("context_length") or 0)
    arch = raw.get("architecture") or {}
    input_mod = list(arch.get("input_modalities") or [])
    output_mod = list(arch.get("output_modalities") or [])
    supports_vision = "image" in input_mod
    supports_image_gen = "image" in output_mod
    mid = raw["id"]
    name = raw.get("name") or mid
    if ":free" in mid.lower() and "(free)" not in name.lower():
        name = f"{name} (free)"
    return {
        "id": mid,
        "name": name,
        "provider": provider.replace("-", " ").title(),
        "description": (raw.get("description") or "")[:280],
        "context_k": max(1, ctx // 1000) if ctx else 8,
        "created": int(raw.get("created") or 0),
        "multimodal": supports_vision,
        "input_modalities": input_mod,
        "output_modalities": output_mod,
        "supports_vision": supports_vision,
        "supports_image_gen": supports_image_gen,
        "supports_tools": _supports_tools(raw),
        "price_1m_usd": 0.0,
        "pricing": {"prompt": prompt, "completion": completion},
        "min_tier": "FREE",
        "cost_segment": "cheap",
        "cost_segment_label": "Бесплатно",
        "source": "openrouter",
    }


def _is_research_model(m: dict) -> bool:
    mid = m["id"].lower()
    if m.get("supports_tools"):
        return True
    return any(tok in mid for tok in ("r1", "reason", "think", "deepseek-r"))


async def _fetch_openrouter_models() -> list[dict]:
    svc = OpenRouterService()
    if not svc.configured():
        return []
    data = await svc.list_models()
    items = data.get("data", [])
    if not isinstance(items, list):
        return []
    out = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        if not is_zero_price_model(raw):
            continue
        if not _is_chat_model(raw):
            continue
        out.append(_normalize(raw))
    return out


async def refresh_free_models_cache(*, force: bool = False) -> None:
    now = time.time()
    if not force and _cache["chat_models"] and (now - _cache["fetched_at"]) < FREE_CACHE_TTL:
        return
    if not openrouter_free_tier_enabled():
        _cache["chat_models"] = []
        _cache["research_models"] = []
        _cache["media_models"] = []
        _cache["by_id"] = {}
        _cache["fetched_at"] = now
        return
    try:
        models = await _fetch_openrouter_models()
    except Exception as exc:
        logger.error("OpenRouter models fetch failed: %s", exc)
        if _cache["chat_models"]:
            return
        models = []
    chat = sorted(models, key=lambda m: (-m["context_k"], -m["created"], m["id"]))
    research = [m for m in chat if _is_research_model(m)]
    media = [m for m in chat if m.get("supports_image_gen")]
    by_id = {m["id"]: m for m in chat}
    if DEFAULT_FREE_MODEL not in by_id:
        by_id[DEFAULT_FREE_MODEL] = _default_free_router()
        chat.insert(0, by_id[DEFAULT_FREE_MODEL])
    _cache["chat_models"] = chat
    _cache["research_models"] = research or chat[:8]
    _cache["media_models"] = media
    _cache["by_id"] = by_id
    _cache["fetched_at"] = now


def get_free_model(model_id: str) -> dict | None:
    return _cache["by_id"].get((model_id or "").strip())


def free_model_allowed(model_id: str) -> bool:
    return get_free_model(model_id) is not None


def _model_list_item(m: dict) -> dict:
    return {
        **m,
        "locked": False,
        "required_tier": "FREE",
        "required_tier_label": "Free",
        "lock_message": None,
        "tier_label": "Free",
        "is_latest": True,
        "cost_band": "cheap",
        "usage_hint": "recommended" if m["id"] == DEFAULT_FREE_MODEL else None,
        "badge": m.get("cost_segment_label"),
    }


async def list_chat_models_for_free_tier() -> list[dict]:
    await refresh_free_models_cache()
    return [_model_list_item(m) for m in _cache.get("chat_models") or []]


async def list_research_models_for_free_tier() -> list[dict]:
    await refresh_free_models_cache()
    return [_model_list_item(m) for m in _cache.get("research_models") or []]


async def list_media_models_for_free_tier() -> list[dict]:
    await refresh_free_models_cache()
    return [_model_list_item(m) for m in _cache.get("media_models") or []]


async def get_default_free_model(*, prefer: str = "balanced") -> str:
    await refresh_free_models_cache()
    models = _cache.get("chat_models") or []
    if not models:
        return DEFAULT_FREE_MODEL
    if prefer == "cheap":
        return min(models, key=lambda m: m.get("context_k", 0))["id"]
    if prefer == "premium":
        vision = [m for m in models if m.get("supports_vision")]
        pool = vision if vision else models
        return max(pool, key=lambda m: m.get("context_k", 0))["id"]
    tools = [m for m in models if m.get("supports_tools")]
    if tools:
        return max(tools, key=lambda m: m.get("context_k", 0))["id"]
    return DEFAULT_FREE_MODEL if free_model_allowed(DEFAULT_FREE_MODEL) else models[0]["id"]


async def model_access_detail_free(model_id: str) -> dict:
    await refresh_free_models_cache()
    mid = (model_id or "").strip()
    m = get_free_model(mid)
    if not m:
        return {
            "allowed": False,
            "reason": "unknown_model",
            "upgrade_hint": "Модель недоступна на Free. Выберите бесплатную модель или оформите Hobby.",
        }
    return {
        "allowed": True,
        "min_tier": "FREE",
        "required_tier_label": "Free",
        "user_tier": "FREE",
        "ceiling_tier": "FREE",
        "upgrade_hint": None,
        "lock_message": None,
    }


async def catalog_meta_free() -> dict:
    await refresh_free_models_cache()
    return {
        "source": "openrouter",
        "total_chat_models": len(_cache.get("chat_models") or []),
        "curated_count": len(_cache.get("chat_models") or []),
        "research_count": len(_cache.get("research_models") or []),
        "media_count": len(_cache.get("media_models") or []),
        "cached_at": _cache["fetched_at"],
        "cache_ttl_sec": FREE_CACHE_TTL,
        "openrouter_base": OPENROUTER_BASE_URL,
    }


def tier_is_free_openrouter(subscription_tier: str | None) -> bool:
    return normalize_tier(subscription_tier) == "FREE"
