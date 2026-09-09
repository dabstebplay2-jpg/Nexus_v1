"""Каталог моделей с Polza.ai GET /models (кэш + авто-обновление)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import NEXUS_MODELS_REFRESH_INTERVAL_SEC, POLZA_BASE_URL, is_testing_mode
from app.curated_models import (
    CATALOG_VERSION,
    COST_SEGMENT_LABEL_RU,
    COST_SEGMENT_ORDER,
    SEGMENT_TO_MIN_TIER,
    apply_curated_catalog,
    curated_ids_union,
)
from app.services import openrouter_models as or_models
from app.services.fx_rates import get_usd_rub_rate_sync
from app.tiers import normalize_tier, tier_allows_ai, tier_uses_openrouter_free
from app.vision_capabilities import apply_vision_metadata, build_vision_guide

logger = logging.getLogger(__name__)

MODELS_CACHE_TTL = int(os.environ.get("NEXUS_MODELS_CACHE_TTL", "1800"))
MODELS_PER_TIER_DISPLAY = int(os.environ.get("NEXUS_MODELS_PER_TIER", "12"))
MAX_MODELS_FOR_USER = int(os.environ.get("NEXUS_MODELS_MAX_VISIBLE", "80"))
AUTO_DISCOVERED_MODELS_LIMIT = int(os.environ.get("NEXUS_MODELS_AUTO_DISCOVER_LIMIT", "40"))
LATEST_MODEL_MAX_AGE_DAYS = int(os.environ.get("NEXUS_MODELS_LATEST_MAX_AGE_DAYS", "90"))
MODELS_FAILURE_RETRY_SEC = int(os.environ.get("NEXUS_MODELS_FAILURE_RETRY_SEC", "300"))
_DEFAULT_DISK_CACHE = Path(__file__).resolve().parents[2] / ".cache" / "polza_models.json"
MODELS_DISK_CACHE_PATH = Path(
    os.environ.get("NEXUS_MODELS_DISK_CACHE_PATH") or _DEFAULT_DISK_CACHE
)

TIER_RANK = {"FREE": 0, "HOBBY": 1, "STANDARD": 2, "PRO": 3, "ULTRA": 4}
TIER_ORDER = ["HOBBY", "STANDARD", "PRO", "ULTRA"]
TIER_MARKETING_LABEL = {
    "HOBBY": "Hobby",
    "STANDARD": "Standard",
    "PRO": "Pro",
    "ULTRA": "Ultra",
}

# Потолок доступа к моделям по min_tier (ранг).
# HOBBY — только дешёвый сегмент.
# STANDARD — только cheap + medium (без Pro-моделей).
# PRO / ULTRA — полный каталог.
TIER_MODEL_CEILING = {
    "FREE": 0,
    "HOBBY": 1,
    "STANDARD": 2,
    "PRO": 4,
    "ULTRA": 4,
}

_SKIP_ID_PARTS = re.compile(
    r"(embed|embedding|dall-e|flux|stable-diffusion|/image|moderation|tts|whisper)",
    re.I,
)

_cache: dict[str, Any] = {
    "fetched_at": 0.0,
    "all_text": [],
    "chat_models": [],
    "research_models": [],
    "media_models": [],
    "by_id": {},
    "curated_ids": set(),
    "source_total_models": 0,
    "source_text_models": 0,
    "auto_discovered_count": 0,
    "last_attempt_at": 0.0,
    "last_error": None,
    "source": "empty",
    "disk_cached_at": 0.0,
}
_refresh_lock = asyncio.Lock()


def tier_rank(tier: str | None) -> int:
    return TIER_RANK.get(normalize_tier(tier), 0)


def effective_model_ceiling(subscription_tier: str) -> int:
    """Максимальный ранг min_tier модели, доступной на подписке."""
    return TIER_MODEL_CEILING.get(normalize_tier(subscription_tier), 0)


def _tier_label(tier_id: str) -> str:
    t = normalize_tier(tier_id)
    return TIER_MARKETING_LABEL.get(t, t.title())


def _lock_message(subscription_tier: str, min_tier: str) -> str:
    label = _tier_label(min_tier)
    ceiling = effective_model_ceiling(subscription_tier)
    if ceiling <= 0:
        return f"Нужна подписка {label}"
    return f"Нужен тариф {label} или выше"


def _model_list_item(subscription_tier: str, m: dict) -> dict:
    user_rank = tier_rank(subscription_tier)
    model_band = tier_rank(m.get("min_tier", "ULTRA"))
    min_tier = normalize_tier(m.get("min_tier", "ULTRA"))
    allowed = True if is_testing_mode() else model_allowed(subscription_tier, m["id"])
    seg_label = m.get("cost_segment_label") or m.get("min_tier", "")
    desc = m.get("description") or ""
    hint = m.get("price_hint") or ""
    if hint and hint not in desc:
        desc = f"{desc} · {hint}".strip(" ·")
    enriched = apply_vision_metadata(m)
    created = int(m.get("created") or 0)
    latest_cutoff = int(time.time()) - (LATEST_MODEL_MAX_AGE_DAYS * 86400)
    is_latest = bool(m.get("auto_discovered")) or (created > 0 and created >= latest_cutoff)
    item = {
        **enriched,
        "description": desc[:320],
        "locked": not allowed,
        "required_tier": min_tier,
        "required_tier_label": _tier_label(min_tier),
        "lock_message": None if allowed else _lock_message(subscription_tier, min_tier),
        "tier_label": m["min_tier"].title(),
        "is_latest": is_latest,
        "cost_band": m.get("cost_segment") or m["min_tier"],
        "usage_hint": None,
        "badge": "Новинка" if m.get("auto_discovered") else (seg_label or None),
    }
    if allowed:
        if user_rank == 2 and model_band == 2:
            item["usage_hint"] = "recommended"
            item["badge"] = "Оптимально"
        elif user_rank == 1 and model_band == 1:
            item["usage_hint"] = "recommended"
    return item


def _price_usd_per_1m(prompt: float, completion: float) -> float:
    return (float(prompt or 0) + float(completion or 0)) * 1_000_000


def _is_chat_model(raw: dict) -> bool:
    mid = (raw.get("id") or "").lower()
    model_type = (raw.get("type") or "").strip().lower()
    if model_type and model_type != "chat":
        return False
    if _SKIP_ID_PARTS.search(mid):
        return False
    arch = raw.get("architecture") or {}
    outputs = arch.get("output_modalities") or []
    if outputs and "text" not in outputs:
        return False
    modality = (arch.get("modality") or "").lower()
    if modality and "text" not in modality:
        return False
    if raw.get("expiration_date"):
        return False
    return bool(mid)


def _as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _normalize(raw: dict, usd_rub_rate: float | None = None) -> dict:
    top_provider = raw.get("top_provider") or {}
    provider_pricing = top_provider.get("pricing") or {}
    legacy_pricing = raw.get("pricing") or {}
    rate = max(1.0, float(usd_rub_rate or get_usd_rub_rate_sync()))

    prompt_rub_1m = _as_float(provider_pricing.get("prompt_per_million"))
    completion_rub_1m = _as_float(provider_pricing.get("completion_per_million"))
    if prompt_rub_1m or completion_rub_1m:
        prompt = (prompt_rub_1m / rate) / 1_000_000
        completion = (completion_rub_1m / rate) / 1_000_000
    else:
        prompt = _as_float(legacy_pricing.get("prompt"))
        completion = _as_float(legacy_pricing.get("completion"))
    provider = (raw.get("id") or "").split("/")[0] if "/" in (raw.get("id") or "") else "unknown"
    ctx = int(raw.get("context_length") or top_provider.get("context_length") or 0)
    arch = raw.get("architecture") or {}
    input_mod = list(arch.get("input_modalities") or [])
    output_mod = list(arch.get("output_modalities") or [])
    supports_vision = "image" in input_mod
    supports_image_gen = "image" in output_mod
    return {
        "id": raw["id"],
        "name": raw.get("name") or raw["id"],
        "provider": provider.replace("-", " ").title(),
        "description": (raw.get("short_description") or raw.get("description") or "")[:280],
        "model_type": (raw.get("type") or "chat").strip().lower(),
        "endpoints": list(raw.get("endpoints") or []),
        "context_k": max(1, ctx // 1000) if ctx else 0,
        "created": int(raw.get("created") or 0),
        "multimodal": supports_vision,
        "input_modalities": input_mod,
        "output_modalities": output_mod,
        "supports_vision": supports_vision,
        "supports_image_gen": supports_image_gen,
        "supports_tools": "tools" in (top_provider.get("supported_parameters") or []),
        "supported_parameters": list(top_provider.get("supported_parameters") or []),
        "price_1m_usd": round(_price_usd_per_1m(prompt, completion), 6),
        "pricing": {"prompt": prompt, "completion": completion},
        "pricing_rub_1m": {
            "prompt": prompt_rub_1m,
            "completion": completion_rub_1m,
        },
        "tags": [],
    }


def _automatic_cost_segment(model: dict) -> str:
    total = float(model.get("price_1m_usd") or 0)
    if total <= 0:
        return "very_expensive"
    if total <= 2:
        return "cheap"
    if total <= 10:
        return "medium"
    if total <= 40:
        return "expensive"
    return "very_expensive"


def _automatic_price_hint(model: dict) -> str:
    pricing = model.get("pricing_rub_1m") or {}
    prompt = float(pricing.get("prompt") or 0)
    completion = float(pricing.get("completion") or 0)
    if prompt or completion:
        return f"~{prompt:.0f} / {completion:.0f} ₽ за 1M токенов"
    return "Цена уточняется у провайдера"


def _append_auto_discovered_models(all_models: list[dict], curated: list[dict]) -> list[dict]:
    """Add the newest chat models that are not yet in the hand-curated families."""
    out = list(curated)
    seen: set[str] = set()
    for item in curated:
        for field in ("id", "model_id_standard", "model_id_thinking"):
            value = item.get(field)
            if value:
                seen.add(str(value))

    remaining_capacity = max(0, MAX_MODELS_FOR_USER - len(out))
    limit = min(AUTO_DISCOVERED_MODELS_LIMIT, remaining_capacity)
    if limit <= 0:
        return out

    candidates = [
        m
        for m in all_models
        if m.get("model_type") == "chat"
        and "text" in (m.get("output_modalities") or ["text"])
        and m.get("id") not in seen
        and int(m.get("created") or 0) > 0
    ]
    candidates.sort(key=lambda m: (int(m.get("created") or 0), m.get("id") or ""), reverse=True)

    for model in candidates[:limit]:
        segment = _automatic_cost_segment(model)
        params = set(model.get("supported_parameters") or [])
        supports_thinking = bool({"reasoning", "reasoning_effort", "include_reasoning"} & params)
        mid = model["id"]
        out.append(
            {
                **model,
                "display_name": model.get("name") or mid,
                "family_id": mid,
                "model_id_standard": mid,
                "model_id_thinking": mid if supports_thinking else None,
                "supports_thinking": supports_thinking,
                "thinking_via_reasoning_api": supports_thinking,
                "thinking_hint": "Усиленное рассуждение через API модели" if supports_thinking else "",
                "min_tier": SEGMENT_TO_MIN_TIER[segment],
                "cost_segment": segment,
                "cost_segment_label": COST_SEGMENT_LABEL_RU[segment],
                "category": "chat",
                "media_type": None,
                "research_note": "",
                "quality_score": 80,
                "price_hint": _automatic_price_hint(model),
                "curated": False,
                "auto_discovered": True,
                "catalog_version": CATALOG_VERSION,
            }
        )
    return out


def _assign_min_tiers(models: list[dict]) -> None:
    if not models:
        return
    sorted_by_price = sorted(models, key=lambda m: m["price_1m_usd"])
    n = len(sorted_by_price)
    cuts = [int(n * 0.25), int(n * 0.50), int(n * 0.75)]
    for i, m in enumerate(sorted_by_price):
        if i < cuts[0]:
            m["min_tier"] = "HOBBY"
        elif i < cuts[1]:
            m["min_tier"] = "STANDARD"
        elif i < cuts[2]:
            m["min_tier"] = "PRO"
        else:
            m["min_tier"] = "ULTRA"


def _build_curated(models: list[dict]) -> set[str]:
    by_tier: dict[str, list[dict]] = {t: [] for t in TIER_ORDER}
    for m in models:
        by_tier[m["min_tier"]].append(m)
    curated: set[str] = set()
    for tier in TIER_ORDER:
        for m in sorted(by_tier[tier], key=lambda x: x["created"], reverse=True)[:MODELS_PER_TIER_DISPLAY]:
            curated.add(m["id"])
    return curated


async def _fetch_polza_models() -> list[dict]:
    url = f"{POLZA_BASE_URL.rstrip('/')}/models"
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise RuntimeError(f"Polza /models: {response.status_code}")
    data = response.json().get("data", [])
    return data if isinstance(data, list) else []


def _write_models_disk_cache(raw_list: list[dict]) -> None:
    try:
        MODELS_DISK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = MODELS_DISK_CACHE_PATH.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(
                {"cached_at": time.time(), "data": raw_list},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        temp_path.replace(MODELS_DISK_CACHE_PATH)
    except OSError as exc:
        logger.warning("Models disk cache write failed: %s", exc)


def _read_models_disk_cache() -> tuple[list[dict], float]:
    try:
        payload = json.loads(MODELS_DISK_CACHE_PATH.read_text(encoding="utf-8"))
        data = payload.get("data") if isinstance(payload, dict) else None
        cached_at = float(payload.get("cached_at") or 0) if isinstance(payload, dict) else 0.0
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)], cached_at
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        logger.warning("Models disk cache read failed: %s", exc)
    return [], 0.0


async def refresh_models_cache(*, force: bool = False) -> None:
    now = time.time()
    if not force and _cache["all_text"] and (now - _cache["fetched_at"]) < MODELS_CACHE_TTL:
        return
    if (
        not force
        and _cache["all_text"]
        and _cache.get("last_error")
        and (now - float(_cache.get("last_attempt_at") or 0)) < MODELS_FAILURE_RETRY_SEC
    ):
        return
    async with _refresh_lock:
        now = time.time()
        if not force and _cache["all_text"] and (now - _cache["fetched_at"]) < MODELS_CACHE_TTL:
            return
        if (
            not force
            and _cache["all_text"]
            and _cache.get("last_error")
            and (now - float(_cache.get("last_attempt_at") or 0)) < MODELS_FAILURE_RETRY_SEC
        ):
            return
        _cache["last_attempt_at"] = now
        live_fetch = True
        try:
            raw_list = await _fetch_polza_models()
        except Exception as exc:
            _cache["last_error"] = str(exc)[:240]
            logger.error("Polza models fetch failed: %s", exc)
            if _cache["all_text"]:
                return
            raw_list, disk_cached_at = await asyncio.to_thread(_read_models_disk_cache)
            if not raw_list:
                raise
            live_fetch = False
            _cache["disk_cached_at"] = disk_cached_at
            logger.warning("Using persisted Polza models cache (%d models)", len(raw_list))

        rate = get_usd_rub_rate_sync()
        all_norm = [
            _normalize(r, rate)
            for r in raw_list
            if isinstance(r, dict) and (r.get("id") or "").strip()
        ]
        curated_chat, research_list, media_list = apply_curated_catalog(all_norm)
        chat_list = _append_auto_discovered_models(all_norm, curated_chat)
        _cache["chat_models"] = chat_list
        _cache["research_models"] = research_list
        _cache["media_models"] = media_list
        _cache["all_text"] = chat_list
        combined = chat_list + research_list + media_list
        by_id: dict[str, dict] = {}
        for m in combined:
            by_id[m["id"]] = m
            fid = m.get("family_id")
            if fid and fid != m["id"]:
                by_id[fid] = m
            std = m.get("model_id_standard")
            th = m.get("model_id_thinking")
            if std:
                by_id[std] = m
            if th:
                by_id[th] = m
        _cache["by_id"] = by_id
        _cache["curated_ids"] = curated_ids_union(chat_list, research_list, media_list)
        _cache["source_total_models"] = len(raw_list)
        _cache["source_text_models"] = sum(1 for r in raw_list if isinstance(r, dict) and _is_chat_model(r))
        _cache["auto_discovered_count"] = max(0, len(chat_list) - len(curated_chat))
        _cache["fetched_at"] = time.time()
        _cache["source"] = "polza_live" if live_fetch else "disk_cache"
        if live_fetch:
            _cache["last_error"] = None
            _cache["disk_cached_at"] = _cache["fetched_at"]
            await asyncio.to_thread(_write_models_disk_cache, raw_list)
        logger.info(
            "Polza catalog refreshed: source=%d chat_source=%d visible=%d auto=%d research=%d media=%d",
            _cache["source_total_models"],
            _cache["source_text_models"],
            len(chat_list),
            _cache["auto_discovered_count"],
            len(research_list),
            len(media_list),
        )


async def refresh_all_model_sources(*, force: bool = False) -> None:
    await refresh_models_cache(force=force)
    await or_models.refresh_free_models_cache(force=force)


def get_model(model_id: str) -> dict | None:
    return _cache["by_id"].get(model_id)


def model_allowed(subscription_tier: str, model_id: str) -> bool:
    mid = (model_id or "").strip()
    if not mid:
        return False
    if tier_uses_openrouter_free(subscription_tier):
        if is_testing_mode():
            return or_models.free_model_allowed(mid) or get_model(mid) is not None
        return or_models.free_model_allowed(mid)
    if is_testing_mode():
        return get_model(mid) is not None
    if not tier_allows_ai(subscription_tier):
        return False
    m = get_model(mid)
    if not m:
        return False
    ceiling = effective_model_ceiling(subscription_tier)
    if ceiling <= 0:
        return False
    return tier_rank(m.get("min_tier", "ULTRA")) <= ceiling


def model_access_detail(subscription_tier: str, model_id: str) -> dict:
    mid = (model_id or "").strip()
    if tier_uses_openrouter_free(subscription_tier):
        m = or_models.get_free_model(mid)
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
    m = get_model(mid) if mid else None
    if not m:
        logger.warning(
            "[MODELS: miss] model_id=%r cache_ids=%d fetched_at=%s",
            mid,
            len(_cache.get("by_id") or {}),
            _cache.get("fetched_at"),
        )
        return {
            "allowed": False,
            "reason": "unknown_model",
            "upgrade_hint": "Модель не найдена в каталоге Nexus.",
        }
    min_tier = normalize_tier(m.get("min_tier", "HOBBY"))
    allowed = model_allowed(subscription_tier, mid)
    ceiling = effective_model_ceiling(subscription_tier)
    upgrade_hint = None if allowed else _lock_message(subscription_tier, min_tier)
    return {
        "allowed": allowed,
        "min_tier": min_tier,
        "required_tier_label": _tier_label(min_tier),
        "user_tier": normalize_tier(subscription_tier),
        "ceiling_tier": TIER_ORDER[ceiling - 1] if ceiling > 0 else "FREE",
        "upgrade_hint": upgrade_hint,
        "lock_message": upgrade_hint,
    }


def _sort_catalog_models(models: list[dict]) -> list[dict]:
    seg_index = {s: i for i, s in enumerate(COST_SEGMENT_ORDER)}
    models.sort(
        key=lambda x: (
            tier_rank(x.get("min_tier")),
            seg_index.get(x.get("cost_segment"), 9),
            x.get("price_1m_usd", 0),
            -int(x.get("quality_score") or 0),
            -x.get("created", 0),
        )
    )
    return models


def _catalog_models_for_display(subscription_tier: str, pool: list[dict]) -> list[dict]:
    """Полный каталог для UI: недоступные модели помечены locked + required_tier."""
    if not pool:
        return []
    out = [_model_list_item(subscription_tier, m) for m in pool]
    return _sort_catalog_models(out)


def _usable_models(catalog: list[dict]) -> list[dict]:
    return [m for m in catalog if not m.get("locked")]


async def list_models_for_user(subscription_tier: str) -> list[dict]:
    if tier_uses_openrouter_free(subscription_tier):
        return await or_models.list_chat_models_for_free_tier()
    await refresh_models_cache()
    return _catalog_models_for_display(subscription_tier, _cache.get("chat_models") or [])


async def list_research_models_for_user(subscription_tier: str) -> list[dict]:
    if tier_uses_openrouter_free(subscription_tier):
        return await or_models.list_research_models_for_free_tier()
    await refresh_models_cache()
    return _catalog_models_for_display(subscription_tier, _cache.get("research_models") or [])


async def list_media_models_for_user(subscription_tier: str) -> list[dict]:
    if tier_uses_openrouter_free(subscription_tier):
        return await or_models.list_media_models_for_free_tier()
    await refresh_models_cache()
    return _catalog_models_for_display(subscription_tier, _cache.get("media_models") or [])


async def list_usable_models_for_user(subscription_tier: str) -> list[dict]:
    catalog = await list_models_for_user(subscription_tier)
    return _usable_models(catalog)


async def get_default_model(subscription_tier: str, *, prefer: str = "balanced") -> str:
    if tier_uses_openrouter_free(subscription_tier):
        return await or_models.get_default_free_model(prefer=prefer)
    models = await list_usable_models_for_user(subscription_tier)
    if not models:
        await refresh_models_cache(force=True)
        models = await list_usable_models_for_user(subscription_tier)
    if not models:
        return "deepseek/deepseek-v4-flash"
    if prefer == "cheap":
        return min(models, key=lambda m: m["price_1m_usd"])["id"]
    if prefer == "premium":
        # Дорогие модели — но только из разрешённого потолка
        drain = [m for m in models if m.get("usage_hint") == "premium_drain"]
        pool = drain if drain else models
        return max(pool, key=lambda m: (tier_rank(m["min_tier"]), m.get("price_1m_usd", 0)))["id"]
    # balanced: предпочитаем «оптимальные», не сжигаем кредиты по умолчанию
    recommended = [m for m in models if m.get("usage_hint") == "recommended"]
    if recommended:
        return max(recommended, key=lambda m: m.get("created", 0))["id"]
    user_rank = tier_rank(subscription_tier)
    nominal = [m for m in models if tier_rank(m["min_tier"]) <= user_rank]
    if nominal:
        return max(nominal, key=lambda m: m.get("created", 0))["id"]
    return models[0]["id"]


async def model_access_detail_cached(subscription_tier: str, model_id: str) -> dict:
    """Проверка доступа с подгрузкой каталога (важно для cold start / нескольких инстансов)."""
    if tier_uses_openrouter_free(subscription_tier):
        await or_models.refresh_free_models_cache()
        detail = model_access_detail(subscription_tier, model_id)
        if detail.get("reason") == "unknown_model":
            await or_models.refresh_free_models_cache(force=True)
            detail = model_access_detail(subscription_tier, model_id)
        return detail
    await refresh_models_cache()
    detail = model_access_detail(subscription_tier, model_id)
    if detail.get("reason") == "unknown_model":
        await refresh_models_cache(force=True)
        detail = model_access_detail(subscription_tier, model_id)
    return detail


def get_pricing_for_billing(model_id: str) -> dict | None:
    m = get_model(model_id)
    if not m:
        return None
    p = m.get("pricing") or {}
    return {"input": p.get("prompt"), "output": p.get("completion")}


async def vision_guide_for_user(subscription_tier: str) -> dict:
    chat = await list_models_for_user(subscription_tier)
    research = await list_research_models_for_user(subscription_tier)
    media = await list_media_models_for_user(subscription_tier)
    return build_vision_guide(chat, research, media)


async def catalog_meta() -> dict:
    await refresh_models_cache()
    meta = {
        "source": "polza",
        "total_chat_models": len(_cache["all_text"]),
        "curated_count": len(_cache.get("chat_models") or []),
        "research_count": len(_cache.get("research_models") or []),
        "media_count": len(_cache.get("media_models") or []),
        "cached_at": _cache["fetched_at"],
        "cache_ttl_sec": MODELS_CACHE_TTL,
        "background_refresh_interval_sec": NEXUS_MODELS_REFRESH_INTERVAL_SEC,
        "source_total_models": _cache.get("source_total_models", 0),
        "source_text_models": _cache.get("source_text_models", 0),
        "auto_discovered_count": _cache.get("auto_discovered_count", 0),
        "last_attempt_at": _cache.get("last_attempt_at", 0),
        "last_error": _cache.get("last_error"),
        "active_source": _cache.get("source", "empty"),
        "disk_cached_at": _cache.get("disk_cached_at", 0),
        "tier_ceilings": {
            k: TIER_ORDER[v - 1] if v > 0 else "NONE" for k, v in TIER_MODEL_CEILING.items()
        },
        "catalog_version": CATALOG_VERSION,
        "access_notes": {
            "HOBBY": "Только сегмент «Дешёвые» (июнь 2026).",
            "STANDARD": "Дешёвые + Средние + Дорогие (Pro-модели — высокий расход).",
            "PRO": "Весь кураторский каталог, включая «Очень дорогие».",
            "ULTRA": "Полный кураторский каталог без ограничений.",
            "FREE": "Бесплатные модели OpenRouter (нулевая цена).",
        },
    }
    free_meta = await or_models.catalog_meta_free()
    meta["openrouter_free"] = free_meta
    return meta
