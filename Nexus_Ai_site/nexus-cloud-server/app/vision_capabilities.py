"""Классификация vision / image-gen для каталога моделей Nexus."""

from __future__ import annotations

import re
from typing import Any

# Семейства с сильным vision (кураторский override поверх RouterAI modalities)
_EXCELLENT_RE = re.compile(
    r"(gemini-3\.1-pro|gemini-3\.5-flash|gemini-3-flash|gemini-3\.1-flash(?!-lite)|"
    r"gpt-5\.(4|5)(?!.*nano)|claude-(sonnet-4\.|opus-4\.)|kimi-k2\.6|kimi-k2-thinking|"
    r"grok-4\.20|qwen-3\.7-plus|mistral-large-2512|qwen-3\.5-397b)",
    re.I,
)
_GOOD_RE = re.compile(
    r"(gemini-3\.1-flash-lite|claude-haiku|claude-3-haiku|gpt-5\.4-nano|gpt-5-nano|gpt-5-mini|gpt-5\.4-mini|"
    r"qwen-3\.6-flash|llama-4-scout|mistral-small-2603)",
    re.I,
)
_TEXT_ONLY_RE = re.compile(
    r"(deepseek-v4-flash|deepseek/|sonar|embed|whisper|tts|moderation)",
    re.I,
)
_IMAGE_GEN_RE = re.compile(
    r"(flux|dall-e|/image|imagen|gpt-.*image|gemini-.*image)",
    re.I,
)

VISION_TIER_LABELS = {
    "excellent": "Отлично с фото",
    "good": "Подходит для фото",
    "limited": "Ограниченный vision",
    "none": "Только текст",
    "image_gen": "Генерация изображений",
}

VISION_TIER_NOTES = {
    "excellent": "Стабильно распознаёт объекты, текст на фото и несколько картинок в одном сообщении.",
    "good": "Принимает фото, но хуже на мелком тексте и сложных сценах.",
    "limited": "Технически multimodal — качество может быть непредсказуемым.",
    "none": "Не отправляйте изображения — модель их не обработает.",
    "image_gen": "Создаёт картинки по текстовому описанию (вкладка «Медиа»).",
}


def compute_vision_tier(m: dict) -> str:
    """Возвращает vision_tier для одной модели каталога."""
    mid = (m.get("id") or m.get("model_id_standard") or "").lower()
    category = (m.get("category") or "").lower()
    media_type = (m.get("media_type") or "").lower()

    if category == "media" or media_type == "image" or m.get("supports_image_gen"):
        if m.get("supports_image_gen") or _IMAGE_GEN_RE.search(mid):
            return "image_gen"

    if m.get("category") == "research" or "sonar" in mid:
        return "none"

    supports_vision = bool(m.get("supports_vision") or m.get("multimodal"))

    if not supports_vision or _TEXT_ONLY_RE.search(mid):
        return "none"

    if _EXCELLENT_RE.search(mid):
        return "excellent"
    if _GOOD_RE.search(mid):
        return "good"
    if m.get("supports_image_gen") and not supports_vision:
        return "image_gen"
    return "limited"


def apply_vision_metadata(m: dict) -> dict:
    """Добавляет vision_tier и vision_label к копии модели."""
    tier = compute_vision_tier(m)
    out = {**m, "vision_tier": tier, "vision_label": VISION_TIER_LABELS.get(tier, tier)}
    out["vision_note"] = VISION_TIER_NOTES.get(tier, "")
    out["accepts_images"] = tier in ("excellent", "good", "limited", "image_gen")
    out["accepts_photo_analysis"] = tier in ("excellent", "good", "limited")
    return out


def _guide_entry(m: dict) -> dict[str, Any]:
    name = m.get("display_name") or m.get("name") or m.get("id")
    return {
        "id": m.get("id"),
        "display_name": name,
        "vision_tier": m.get("vision_tier"),
        "vision_note": m.get("vision_note") or "",
        "locked": bool(m.get("locked")),
    }


def build_vision_guide(
    chat_models: list[dict],
    research_models: list[dict],
    media_models: list[dict],
) -> dict[str, list[dict]]:
    """Справочник для UI: кто хорошо/плохо работает с фотографиями."""
    buckets: dict[str, list[dict]] = {
        "excellent": [],
        "good": [],
        "text_only": [],
        "image_generation": [],
    }
    seen: set[str] = set()

    def add(m: dict, bucket: str) -> None:
        mid = m.get("id") or ""
        if not mid or mid in seen:
            return
        seen.add(mid)
        buckets[bucket].append(_guide_entry(m))

    for m in chat_models:
        if m.get("locked"):
            continue
        tier = m.get("vision_tier") or compute_vision_tier(m)
        if tier == "excellent":
            add(m, "excellent")
        elif tier == "good":
            add(m, "good")
        elif tier in ("none", "limited") and not m.get("accepts_photo_analysis"):
            add(m, "text_only")

    for m in research_models:
        if not m.get("locked"):
            add({**m, "vision_tier": "none", "vision_note": "Research-модели для поиска в сети, не для анализа фото."}, "text_only")

    for m in media_models:
        if not m.get("locked"):
            add(
                {
                    **m,
                    "vision_tier": "image_gen",
                    "vision_note": VISION_TIER_NOTES["image_gen"],
                },
                "image_generation",
            )

    for key in buckets:
        buckets[key].sort(key=lambda x: (x.get("display_name") or "").lower())
    return buckets
