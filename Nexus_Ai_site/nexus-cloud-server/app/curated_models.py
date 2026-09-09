"""Базовый кураторский каталог Nexus + автодобавление свежих моделей Polza."""

from __future__ import annotations

import re

CATALOG_VERSION = "2026-07-14-dynamic-v3"

COST_SEGMENT_ORDER = ["cheap", "medium", "expensive", "very_expensive"]
COST_SEGMENT_LABEL_RU = {
    "cheap": "Дешёвые",
    "medium": "Средние",
    "expensive": "Дорогие",
    "very_expensive": "Очень дорогие",
}

SEGMENT_TO_MIN_TIER = {
    "cheap": "HOBBY",
    "medium": "STANDARD",
    "expensive": "PRO",
    "very_expensive": "ULTRA",
}


def _family(
    family_id: str,
    display_name: str,
    provider: str,
    segment: str,
    standard_match: list[str],
    *,
    thinking_match: list[str] | None = None,
    thinking_via_reasoning_api: bool = False,
    quality: int = 80,
    price_hint: str = "",
    thinking_hint: str = "Усиленное рассуждение (дороже)",
    research_note: str = "",
    media: str | None = None,
) -> dict:
    return {
        "family_id": family_id,
        "display_name": display_name,
        "provider": provider,
        "segment": segment,
        "standard_match": standard_match,
        "thinking_match": thinking_match or [],
        "thinking_via_reasoning_api": thinking_via_reasoning_api,
        "quality": quality,
        "price_hint": price_hint,
        "thinking_hint": thinking_hint,
        "research_note": research_note,
        "media": media,
    }


# ─── Семейства чата ───────────────────────────────────────────────────────────
CURATED_FAMILIES: list[dict] = [
    _family(
        "deepseek-v4-flash",
        "DeepSeek V4 Flash",
        "DeepSeek",
        "cheap",
        ["deepseek/deepseek-v4-flash"],
        price_hint="~$0.14 / $0.28 за 1M",
        quality=88,
    ),
    _family(
        "gpt-5.4-nano",
        "GPT-5.4 nano",
        "OpenAI",
        "cheap",
        ["openai/gpt-5.4-nano", "openai/gpt-5-nano"],
        price_hint="~$0.20 / $1.25 за 1M",
        quality=84,
    ),
    _family(
        "claude-haiku-4.5",
        "Claude Haiku 4.5",
        "Anthropic",
        "cheap",
        ["anthropic/claude-haiku-4.5"],
        price_hint="~$1 / $5 за 1M",
        quality=86,
    ),
    _family(
        "gemini-3.1-flash-lite",
        "Gemini 3.1 Flash Lite",
        "Google",
        "cheap",
        ["google/gemini-3.1-flash-lite-preview", "google/gemini-3.1-flash-lite"],
        price_hint="~$0.10 / $0.40 за 1M",
        quality=85,
    ),
    _family(
        "qwen-3.6-flash",
        "Qwen 3.6 Flash",
        "Alibaba",
        "cheap",
        ["qwen/qwen3.6-flash"],
        price_hint="~$0.018 / $0.108 за 1M",
        quality=87,
    ),
    _family(
        "llama-4-scout",
        "Llama 4 Scout",
        "Meta",
        "cheap",
        ["meta-llama/llama-4-scout"],
        price_hint="~$0.007 / $0.028 за 1M",
        quality=85,
    ),
    _family(
        "mistral-small-2603",
        "Mistral Small 2603",
        "Mistral",
        "cheap",
        ["mistralai/mistral-small-2603"],
        price_hint="~$0.014 / $0.057 за 1M",
        quality=86,
    ),
    _family(
        "claude-3-haiku",
        "Claude 3 Haiku",
        "Anthropic",
        "cheap",
        ["anthropic/claude-3-haiku"],
        price_hint="~$0.024 / $0.12 за 1M",
        quality=83,
    ),
    _family(
        "gpt-5.4-mini",
        "GPT-5.4 mini",
        "OpenAI",
        "medium",
        ["openai/gpt-5.4-mini", "openai/gpt-5-mini"],
        price_hint="~$0.75 / $4.50 за 1M",
        quality=88,
    ),
    _family(
        "gemini-3.5-flash",
        "Gemini 3.5 Flash",
        "Google",
        "medium",
        ["google/gemini-3.5-flash"],
        price_hint="~$0.30 / $2.50 за 1M",
        quality=88,
    ),
    _family(
        "gemini-3-flash",
        "Gemini 3 Flash",
        "Google",
        "medium",
        ["google/gemini-3-flash-preview"],
        price_hint="Быстрый Gemini 3",
        quality=87,
    ),
    _family(
        "claude-sonnet-4.6",
        "Claude Sonnet 4.6",
        "Anthropic",
        "medium",
        ["anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-4.5"],
        price_hint="~$3 / $15 за 1M",
        quality=92,
    ),
    _family(
        "gpt-5.4",
        "GPT-5.4",
        "OpenAI",
        "medium",
        ["openai/gpt-5.4"],
        thinking_via_reasoning_api=True,
        price_hint="Стандарт · ~$2.50 / $15",
        thinking_hint="Режим мышления · GPT-5.4",
        quality=91,
    ),
    _family(
        "deepseek-v4-pro",
        "DeepSeek V4 Pro",
        "DeepSeek",
        "medium",
        ["deepseek/deepseek-v4-pro"],
        price_hint="Reasoning · ~$0.44 / $0.87",
        quality=93,
    ),
    _family(
        "sonar",
        "Sonar",
        "Perplexity",
        "medium",
        ["perplexity/sonar"],
        price_hint="~$1 / $1 + поиск",
        quality=89,
    ),
    _family(
        "kimi-k2.6",
        "Kimi K2.6",
        "Moonshot",
        "medium",
        ["moonshotai/kimi-k2.6"],
        thinking_via_reasoning_api=True,
        price_hint="Новая multimodal",
        thinking_hint="Режим мышления · Kimi K2.6",
        quality=90,
    ),
    _family(
        "qwen-3.7-plus",
        "Qwen 3.7 Plus",
        "Alibaba",
        "medium",
        ["qwen/qwen3.7-plus"],
        price_hint="~$0.038 / $0.154 за 1M",
        quality=91,
    ),
    _family(
        "mistral-large-2512",
        "Mistral Large 2512",
        "Mistral",
        "medium",
        ["mistralai/mistral-large-2512"],
        price_hint="~$0.048 / $0.144 за 1M",
        quality=92,
    ),
    _family(
        "gpt-5.5",
        "GPT-5.5",
        "OpenAI",
        "expensive",
        ["openai/gpt-5.5"],
        thinking_match=["openai/gpt-5.5-pro"],
        price_hint="~$5 / $30",
        thinking_hint="GPT-5.5 Pro · Max",
        quality=95,
    ),
    _family(
        "claude-opus-4.8",
        "Claude Opus 4.8",
        "Anthropic",
        "expensive",
        ["anthropic/claude-opus-4.8", "anthropic/claude-opus-4.7"],
        thinking_match=["anthropic/claude-opus-4.8-fast"],
        price_hint="~$5 / $25",
        thinking_hint="Opus 4.8 Fast",
        quality=97,
    ),
    _family(
        "gemini-3.1-pro",
        "Gemini 3.1 Pro",
        "Google",
        "expensive",
        ["google/gemini-3.1-pro-preview", "google/gemini-3.1-pro-preview-customtools"],
        price_hint="~$1.25 / $10 · 1M ctx",
        quality=94,
    ),
    _family(
        "sonar-pro",
        "Sonar Pro",
        "Perplexity",
        "expensive",
        ["perplexity/sonar-pro", "perplexity/sonar-pro-search"],
        price_hint="~$3 / $15 + поиск",
        quality=93,
    ),
    _family(
        "qwen-3.7-max",
        "Qwen 3.7 Max",
        "Alibaba",
        "expensive",
        ["qwen/qwen3.7-max"],
        price_hint="~$0.12 / $0.36 за 1M",
        quality=94,
    ),
    _family(
        "sonar-reasoning-pro",
        "Sonar Reasoning Pro",
        "Perplexity",
        "expensive",
        ["perplexity/sonar-reasoning-pro"],
        price_hint="CoT + поиск",
        quality=95,
    ),
    _family(
        "claude-opus-4.7",
        "Claude Opus 4.7",
        "Anthropic",
        "expensive",
        ["anthropic/claude-opus-4.7"],
        price_hint="~$0.48 / $2.41 за 1M",
        quality=96,
    ),
    _family(
        "grok-4.20",
        "Grok 4.20",
        "xAI",
        "expensive",
        ["x-ai/grok-4.20"],
        price_hint="~$1.20 / $2.41 за 1M",
        quality=95,
    ),
    _family(
        "gpt-5.4-pro",
        "GPT-5.4 Pro",
        "OpenAI",
        "very_expensive",
        ["openai/gpt-5.4-pro"],
        price_hint="~$15+ за 1M out",
        quality=96,
    ),
    _family(
        "gpt-5.5-pro",
        "GPT-5.5 Pro",
        "OpenAI",
        "very_expensive",
        ["openai/gpt-5.5-pro"],
        price_hint="~$30 / $180",
        quality=98,
    ),
    _family(
        "grok-4.20-multi-agent",
        "Grok 4.20 Multi-Agent",
        "xAI",
        "very_expensive",
        ["x-ai/grok-4.20-multi-agent"],
        price_hint="Мульти-агентный Grok",
        quality=97,
    ),
    _family(
        "qwen-3.5-397b",
        "Qwen 3.5 397B",
        "Alibaba",
        "very_expensive",
        ["qwen/qwen3.5-397b-a17b"],
        price_hint="Гигантская смесь экспертов",
        quality=96,
    ),
]

CURATED_RESEARCH_FAMILIES: list[dict] = [
    _family("sonar", "Sonar", "Perplexity", "medium", ["perplexity/sonar"], research_note="поиск"),
    _family(
        "sonar-pro",
        "Sonar Pro",
        "Perplexity",
        "expensive",
        ["perplexity/sonar-pro"],
        research_note="поиск",
    ),
    _family(
        "sonar-reasoning-pro",
        "Sonar Reasoning Pro",
        "Perplexity",
        "expensive",
        ["perplexity/sonar-reasoning-pro"],
        research_note="reasoning",
    ),
    _family(
        "sonar-deep-research",
        "Sonar Deep Research",
        "Perplexity",
        "very_expensive",
        ["perplexity/sonar-deep-research"],
        research_note="deep research",
    ),
    _family(
        "gemini-3.1-pro",
        "Gemini 3.1 Pro",
        "Google",
        "expensive",
        ["google/gemini-3.1-pro-preview"],
        research_note="глубокий анализ",
    ),
    _family(
        "gpt-5.5",
        "GPT-5.5",
        "OpenAI",
        "expensive",
        ["openai/gpt-5.5"],
        thinking_match=["openai/gpt-5.5-pro"],
        research_note="глубокий анализ",
    ),
]

CURATED_MEDIA_FAMILIES: list[dict] = [
    # --- cheap (Hobby) ---
    _family(
        "flux-klein",
        "Flux 2 Klein",
        "Flux",
        "cheap",
        ["black-forest-labs/flux.2-klein-4b"],
        price_hint="Быстрая генерация",
        media="image",
        quality=84,
    ),
    _family(
        "gemini-2.5-flash-image",
        "Gemini 2.5 Flash Image",
        "Google",
        "cheap",
        ["google/gemini-2.5-flash-image"],
        price_hint="Сверхдешёвая генерация",
        media="image",
        quality=82,
    ),
    _family(
        "gpt-5-image-mini",
        "GPT-5 Image Mini",
        "OpenAI",
        "cheap",
        ["openai/gpt-5-image-mini"],
        price_hint="Легкая модель от OpenAI",
        media="image",
        quality=85,
    ),

    # --- medium (Standard) ---
    _family(
        "gemini-3.1-flash-image",
        "Gemini 3.1 Flash Image",
        "Google",
        "medium",
        ["google/gemini-3.1-flash-image-preview"],
        price_hint="Сбалансированная модель",
        media="image",
        quality=88,
    ),
    _family(
        "gpt-5-image",
        "GPT-5 Image",
        "OpenAI",
        "medium",
        ["openai/gpt-5-image"],
        price_hint="Качественная генерация",
        media="image",
        quality=89,
    ),

    # --- expensive (Pro) ---
    _family(
        "flux-pro",
        "Flux 2 Pro",
        "Flux",
        "expensive",
        ["black-forest-labs/flux.2-pro", "black-forest-labs/flux.2-flex"],
        price_hint="Профессиональное качество",
        media="image",
        quality=94,
    ),
    _family(
        "gemini-3-pro-image",
        "Gemini 3 Pro Image",
        "Google",
        "expensive",
        ["google/gemini-3-pro-image-preview"],
        price_hint="Детализированные изображения",
        media="image",
        quality=93,
    ),
    _family(
        "seedream-4.5",
        "Seedream 4.5",
        "ByteDance",
        "expensive",
        ["bytedance-seed/seedream-4.5"],
        price_hint="Инновационная модель от ByteDance",
        media="image",
        quality=92,
    ),

    # --- very_expensive (Ultra) ---
    _family(
        "flux-max",
        "Flux 2 Max",
        "Flux",
        "very_expensive",
        ["black-forest-labs/flux.2-max"],
        price_hint="Максимальное качество Flux",
        media="image",
        quality=97,
    ),
    _family(
        "gpt-5.4-image-2",
        "GPT-5.4 Image 2",
        "OpenAI",
        "very_expensive",
        ["openai/gpt-5.4-image-2"],
        price_hint="Флагманская генерация OpenAI",
        media="image",
        quality=96,
    ),
]

_MEDIA_RE = re.compile(
    r"(flux|dall-e|/image|imagen|gpt-5.*image|gemini-.*image|video|kling|runway|luma|veo)",
    re.I,
)


def _find_router_model(by_id: dict, patterns: list[str]) -> dict | None:
    for p in patterns:
        key = p.lower()
        if key in by_id:
            return by_id[key]
        for mid, m in by_id.items():
            if mid.lower() == key:
                return m
    for p in patterns:
        pl = p.lower()
        for mid, m in by_id.items():
            if pl in mid.lower():
                return m
    return None


def _resolve_family(by_id: dict, spec: dict) -> dict | None:
    standard = _find_router_model(by_id, spec["standard_match"])
    if not standard:
        return None
    if spec.get("thinking_via_reasoning_api"):
        return {
            "standard": standard,
            "thinking": standard,
            "supports_thinking": True,
            "thinking_via_reasoning_api": True,
        }
    thinking = None
    if spec.get("thinking_match"):
        thinking = _find_router_model(by_id, spec["thinking_match"])
        if thinking and thinking["id"] == standard["id"]:
            thinking = None
    supports = thinking is not None
    return {
        "standard": standard,
        "thinking": thinking,
        "supports_thinking": supports,
        "thinking_via_reasoning_api": False,
    }


def _family_to_item(
    resolved: dict,
    spec: dict,
    category: str,
) -> dict:
    standard = resolved["standard"]
    thinking = resolved.get("thinking")
    seg = spec["segment"]
    display = spec["display_name"]
    via_api = bool(resolved.get("thinking_via_reasoning_api"))
    thinking_id = thinking["id"] if thinking else None
    if via_api and thinking_id == standard["id"]:
        thinking_id = standard["id"]
    item = {
        **standard,
        "id": standard["id"],
        "name": display,
        "display_name": display,
        "family_id": spec["family_id"],
        "model_id_standard": standard["id"],
        "model_id_thinking": thinking_id if via_api or thinking else None,
        "supports_thinking": resolved["supports_thinking"],
        "thinking_via_reasoning_api": via_api,
        "thinking_hint": spec.get("thinking_hint", ""),
        "min_tier": SEGMENT_TO_MIN_TIER[seg],
        "cost_segment": seg,
        "cost_segment_label": COST_SEGMENT_LABEL_RU[seg],
        "provider": spec.get("provider") or standard.get("provider"),
        "category": category,
        "media_type": spec.get("media"),
        "research_note": spec.get("research_note") or "",
        "quality_score": spec.get("quality", 80),
        "price_hint": spec.get("price_hint", ""),
        "curated": True,
        "catalog_version": CATALOG_VERSION,
    }
    if thinking:
        item["price_hint_thinking"] = (
            f"Мышление: {thinking.get('name') or thinking['id']}"
        )
    return item


def _build_families(by_id: dict, pool: list[dict], category: str) -> list[dict]:
    out: list[dict] = []
    seen_families: set[str] = set()
    seen_ids: set[str] = set()
    for spec in pool:
        fid = spec["family_id"]
        if fid in seen_families:
            continue
        resolved = _resolve_family(by_id, spec)
        if not resolved:
            continue
        seen_families.add(fid)
        item = _family_to_item(resolved, spec, category)
        if item["id"] in seen_ids:
            continue
        seen_ids.add(item["id"])
        out.append(item)
    return out


def apply_curated_catalog(all_models: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    by_id = {m["id"]: m for m in all_models}

    chat_out = _build_families(by_id, CURATED_FAMILIES, "chat")
    research_out = _build_families(by_id, CURATED_RESEARCH_FAMILIES, "research")
    media_out = _build_families(by_id, CURATED_MEDIA_FAMILIES, "media")

    seen = {m["id"] for m in chat_out + research_out + media_out}
    for mid, m in by_id.items():
        if mid in seen:
            continue
        if not _MEDIA_RE.search(mid):
            continue
        seen.add(mid)
        is_video = "video" in mid.lower()
        seg = "expensive" if is_video else "medium"
        media_out.append(
            {
                **m,
                "display_name": m.get("name") or mid,
                "family_id": mid,
                "model_id_standard": mid,
                "model_id_thinking": None,
                "supports_thinking": False,
                "min_tier": SEGMENT_TO_MIN_TIER[seg],
                "cost_segment": seg,
                "cost_segment_label": COST_SEGMENT_LABEL_RU[seg],
                "category": "media",
                "media_type": "video" if is_video else "image",
                "curated": False,
                "catalog_version": CATALOG_VERSION,
            }
        )

    return chat_out, research_out, media_out


def curated_ids_union(chat: list, research: list, media: list) -> set[str]:
    ids: set[str] = set()
    for m in chat + research + media:
        ids.add(m["id"])
        if m.get("model_id_thinking"):
            ids.add(m["model_id_thinking"])
    return ids
