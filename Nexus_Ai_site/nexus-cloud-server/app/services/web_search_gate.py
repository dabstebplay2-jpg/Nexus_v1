"""Решает, нужен ли веб-поиск для конкретного сообщения (умный автопоиск)."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum

from app import models_catalog
from app.services.web_search_agent import _call_planner_llm, _parse_planner_json

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[\w\u0400-\u04FF]+", re.UNICODE)

_GREETING_RE = re.compile(
    r"^(?:привет|здравствуй(?:те)?|hello|hi|hey|хай|здарова|добрый\s+(?:день|вечер|утро)|"
    r"good\s+(?:morning|evening|afternoon)|приветствую|салют|yo)[\s!.,?]*$",
    re.I,
)

_META_RE = re.compile(
    r"(?:что\s+ты\s+умеешь|что\s+умеешь|кто\s+ты|чем\s+(?:ты\s+)?можешь\s+помочь|"
    r"чем\s+помочь|как\s+ты\s+работаешь|help\b|помощь|capabilities|who\s+are\s+you|"
    r"what\s+can\s+you\s+do)",
    re.I,
)

_EXPLICIT_RE = re.compile(
    r"(?:найди|найти|поищи|поиск|загугли|гугл(?:и|ь)|search(?:\s+the)?\s+web|"
    r"google\s+it|look\s+up|в\s+интернете|в\s+сети|online|по\s+интернету|"
    r"свежие\s+новости|последние\s+новости|актуальн)",
    re.I,
)

_FRESHNESS_RE = re.compile(
    r"(?:сегодня|сейчас|текущ(?:ий|ая|ее)|последн(?:ие|их)|свеж(?:ие|их)|"
    r"актуальн|на\s+данный\s+момент|за\s+неделю|за\s+месяц|"
    r"20(?:2[4-9]|3\d)|news|latest|current|today|this\s+week)",
    re.I,
)

_CREATIVE_RE = re.compile(
    r"(?:(?:сделай|создай|напиши|сгенерируй|придумай|разработай|сделать|создать|"
    r"написать|build|create|write|make)(?:\s+мне)?|(?:можешь|можешь\s+ли)\s+"
    r"(?:сделать|написать|создать))\s+"
    r"(?:сайт|лендинг|код|скрипт|программу|историю|стих|песню|"
    r"landing|website|app|script|story|poem)",
    re.I,
)


class HeuristicClass(str, Enum):
    SKIP_GREETING = "skip_greeting"
    SKIP_META = "skip_meta"
    SKIP_CREATIVE = "skip_creative"
    SKIP_SHORT = "skip_short"
    EXPLICIT = "explicit"
    LIKELY_FRESH = "likely_fresh"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class WebSearchDecision:
    should_search: bool
    reason: str


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def classify_web_search_heuristic(user_text: str) -> HeuristicClass:
    """Синхронная эвристика без LLM."""
    text = _normalize(user_text)
    if not text:
        return HeuristicClass.SKIP_SHORT

    if _GREETING_RE.match(text):
        return HeuristicClass.SKIP_GREETING

    if _META_RE.search(text):
        return HeuristicClass.SKIP_META

    if _EXPLICIT_RE.search(text):
        return HeuristicClass.EXPLICIT

    if _CREATIVE_RE.search(text) and not _FRESHNESS_RE.search(text) and not _EXPLICIT_RE.search(text):
        return HeuristicClass.SKIP_CREATIVE

    low = text.lower()
    if len(text) < 24 and "?" not in text and not _FRESHNESS_RE.search(low):
        words = _TOKEN_RE.findall(low)
        if len(words) <= 4:
            return HeuristicClass.SKIP_SHORT

    if _FRESHNESS_RE.search(text):
        return HeuristicClass.LIKELY_FRESH

    return HeuristicClass.UNCERTAIN


def _heuristic_decision(
    heuristic: HeuristicClass, *, preference_enabled: bool
) -> WebSearchDecision | None:
    if heuristic == HeuristicClass.EXPLICIT:
        return WebSearchDecision(True, "explicit")
    if heuristic in (
        HeuristicClass.SKIP_GREETING,
        HeuristicClass.SKIP_META,
        HeuristicClass.SKIP_CREATIVE,
        HeuristicClass.SKIP_SHORT,
    ):
        return WebSearchDecision(False, heuristic.value)
    if heuristic == HeuristicClass.LIKELY_FRESH:
        if preference_enabled:
            return WebSearchDecision(True, "likely_fresh")
        return None
    if heuristic == HeuristicClass.UNCERTAIN:
        return None
    return None


async def _llm_gate(user_text: str, *, api_key: str, subscription_tier: str) -> WebSearchDecision:
    if not api_key:
        return WebSearchDecision(False, "llm_no_key")

    system = (
        "Ты классификатор Nexus. Нужен ли веб-поиск для ответа на сообщение пользователя?\n"
        "Ответь ТОЛЬКО JSON без markdown:\n"
        '{\"needs_web_search\": true|false, \"reason\": \"кратко RU\"}\n'
        "needs_web_search=true: нужны свежие факты из интернета (новости, курсы, цены, "
        "события, актуальные данные, проверка фактов).\n"
        "needs_web_search=false: приветствие, smalltalk, мета-вопросы о боте, творческие "
        "задачи (код, сайт, текст) без запроса актуальных данных из сети, общие знания."
    )
    user = f"Сообщение пользователя:\n{user_text.strip()[:2000]}"
    try:
        model = await models_catalog.get_default_model(subscription_tier, prefer="cheap")
    except Exception:
        model = "openai/gpt-4o-mini"

    try:
        raw = await _call_planner_llm(
            api_key,
            model,
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
    except Exception as exc:
        logger.warning("web search LLM gate failed: %s", exc)
        return WebSearchDecision(False, "llm_error")

    data = _parse_planner_json(raw)
    needs = data.get("needs_web_search")
    if needs is None:
        needs = data.get("needs_search")
    if isinstance(needs, str):
        needs = needs.strip().lower() in ("true", "1", "yes", "да")
    reason = str(data.get("reason") or "llm").strip() or "llm"
    return WebSearchDecision(bool(needs), f"llm:{reason[:80]}")


async def resolve_web_search_need(
    user_text: str,
    *,
    preference_enabled: bool,
    api_key: str = "",
    subscription_tier: str = "STANDARD",
) -> WebSearchDecision:
    """
    preference_enabled: тоггл «Автопоиск» в UI (разрешить умный поиск).
    Явный intent ищет даже при preference_enabled=False.
    """
    text = _normalize(user_text)
    if not text:
        return WebSearchDecision(False, "empty")

    heuristic = classify_web_search_heuristic(text)
    early = _heuristic_decision(heuristic, preference_enabled=preference_enabled)
    if early is not None:
        return early

    if not preference_enabled:
        return WebSearchDecision(False, "preference_off")

    return await _llm_gate(text, api_key=api_key, subscription_tier=subscription_tier)
