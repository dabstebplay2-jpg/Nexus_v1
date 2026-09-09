"""Пресеты глубины веб-поиска в чате (влияют на время, токены и списания)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WebSearchDepthPreset:
    id: str
    label_ru: str
    hint_ru: str
    target_sources: int
    max_sources: int
    max_rounds: int
    max_seconds: int
    per_query_limit: int
    max_heuristic_queries: int
    prompt_source_cap: int
    use_planner: bool
    answer_min_sources: int


PRESETS: dict[str, WebSearchDepthPreset] = {
    "quick": WebSearchDepthPreset(
        id="quick",
        label_ru="Быстрый",
        hint_ru="~8–15 с · до 12 источников · минимум списаний с баланса",
        target_sources=8,
        max_sources=12,
        max_rounds=1,
        max_seconds=14,
        per_query_limit=6,
        max_heuristic_queries=3,
        prompt_source_cap=8,
        use_planner=False,
        answer_min_sources=6,
    ),
    "standard": WebSearchDepthPreset(
        id="standard",
        label_ru="Обычный",
        hint_ru="~15–25 с · до 25 источников · сбалансированный поиск",
        target_sources=16,
        max_sources=25,
        max_rounds=2,
        max_seconds=24,
        per_query_limit=10,
        max_heuristic_queries=5,
        prompt_source_cap=16,
        use_planner=True,
        answer_min_sources=10,
    ),
    "deep": WebSearchDepthPreset(
        id="deep",
        label_ru="Глубокий",
        hint_ru="~35–50 с · до 60 источников · больше времени и списаний",
        target_sources=32,
        max_sources=55,
        max_rounds=3,
        max_seconds=45,
        per_query_limit=14,
        max_heuristic_queries=8,
        prompt_source_cap=28,
        use_planner=True,
        answer_min_sources=14,
    ),
}

DEFAULT_CHAT_DEPTH = "standard"


def resolve_web_search_depth(raw: str | None) -> WebSearchDepthPreset:
    key = (raw or DEFAULT_CHAT_DEPTH).strip().lower()
    if key not in PRESETS:
        return PRESETS[DEFAULT_CHAT_DEPTH]
    return PRESETS[key]


def depth_public_dict(preset: WebSearchDepthPreset) -> dict[str, Any]:
    return {
        "id": preset.id,
        "label": preset.label_ru,
        "hint": preset.hint_ru,
        "target_sources": preset.target_sources,
        "max_sources": preset.max_sources,
        "max_rounds": preset.max_rounds,
        "max_seconds": preset.max_seconds,
    }


def all_depths_public() -> list[dict[str, Any]]:
    return [depth_public_dict(PRESETS[k]) for k in ("quick", "standard", "deep")]
