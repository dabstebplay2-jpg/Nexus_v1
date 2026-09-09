"""Адаптивный многошаговый веб-поиск (DDG + опционально Tavily)."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app import models_catalog
from app.config import (
    OPENROUTER_APP_TITLE,
    OPENROUTER_BASE_URL,
    OPENROUTER_HTTP_REFERER,
    POLZA_BASE_URL,
    WEB_SEARCH_MAX_ROUNDS,
    WEB_SEARCH_MAX_SECONDS,
    WEB_SEARCH_MAX_SOURCES,
    WEB_SEARCH_PROMPT_MAX_CHARS,
    WEB_SEARCH_SNIPPET_MAX_CHARS,
    WEB_SEARCH_TARGET_SOURCES,
)
from app.services.web_search import format_sources_for_prompt, search_many_parallel
from app.services.web_search_depth import WebSearchDepthPreset, resolve_web_search_depth

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None] | None]

_TOKEN_RE = re.compile(r"[\w\u0400-\u04FF]+", re.UNICODE)


def _tokenize(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text or "") if len(t) > 1}


def dedupe_sources(results: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for r in results:
        url = (r.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(r)
    return out


def rank_sources(query: str, sources: list[dict]) -> list[dict]:
    q_tokens = _tokenize(query)
    if not q_tokens:
        return list(sources)

    def score(item: dict) -> float:
        blob = f"{item.get('title', '')} {item.get('snippet', '')}".lower()
        tokens = _tokenize(blob)
        if not tokens:
            return 0.0
        overlap = len(q_tokens & tokens)
        return overlap / max(len(q_tokens), 1)

    return sorted(sources, key=score, reverse=True)


def _clip_query(text: str, max_len: int = 88) -> str:
    q = re.sub(r"\s+", " ", (text or "").strip())
    if len(q) <= max_len:
        return q
    return q[: max_len - 1].rsplit(" ", 1)[0] or q[:max_len]


def normalize_search_queries(queries: list[str], *, max_count: int = 8) -> list[str]:
    """Убирает дубликаты и почти одинаковые длинные строки."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in queries:
        q = _clip_query(raw)
        if len(q) < 4:
            continue
        key = q.lower()
        if key in seen:
            continue
        # Пропустить, если уже есть более общий короткий запрос с тем же началом
        if any(key.startswith(s) and len(s) >= 12 for s in seen):
            continue
        # Удалить более длинные, если новый — их префикс
        seen = {s for s in seen if not s.startswith(key[:20]) or len(s) <= len(key)}
        seen.add(key)
        cleaned.append(q)
    cleaned.sort(key=len)
    # Оставить разнообразные по длине/содержанию
    out: list[str] = []
    for q in cleaned:
        key = q.lower()
        if any(key in o.lower() or o.lower() in key for o in out if key != o.lower()):
            if len(out) >= 1 and len(q) > len(out[-1]) + 20:
                continue
        out.append(q)
        if len(out) >= max_count:
            break
    return out[:max_count]


def _freshness_query_suffix(user_query: str) -> list[str]:
    """Доп. короткие запросы с акцентом на актуальность."""
    low = (user_query or "").lower()
    extra: list[str] = []
    if re.search(r"(patch|верси|обновлен|update|meta|guide|билд|build|новост|news|202\d)", low, re.I):
        extra.append("latest 2026")
    if re.search(r"(игр|game|honkai|star rail|hsr|gacha|персонаж|character)", low, re.I):
        extra.append("current meta 2026")
    return extra[:2]


def expand_heuristic_queries(user_query: str, *, max_queries: int = 8) -> list[str]:
    """Короткие поисковые фразы без повторения всего сообщения пользователя."""
    base = user_query.strip()
    if not base:
        return []
    words = _TOKEN_RE.findall(base)
    low = base.lower()
    queries: list[str] = []

    # Сжатое ядро (до 10 слов)
    core = " ".join(words[:10]) if words else base
    queries.append(_clip_query(core))

    latin = " ".join(w for w in words if re.match(r"[A-Za-z]{2,}", w))
    if latin and latin.lower() not in core.lower():
        queries.append(_clip_query(latin))

    if re.search(r"(кастор|castor)", low):
        queries.append("Castorice Honkai Star Rail character")
        queries.append("Castorice HSR build team guide")
    if re.search(r"(honkai|star rail|hsr)", low, re.I):
        queries.append(_clip_query(f"{core} fandom wiki"))
    if re.search(r"(персонаж|character|герой|hero|билд|build|собрать)", low, re.I):
        queries.append(_clip_query(f"{core} build guide"))
    if re.search(r"(верси|patch|обновлен|update)", low, re.I):
        queries.append(_clip_query(f"{core} patch notes"))

    if re.search(r"[\u0400-\u04FF]", base) and not latin:
        queries.append(_clip_query(f"{core} english wiki"))

    for extra in _freshness_query_suffix(base):
        queries.append(_clip_query(extra))

    return normalize_search_queries(queries, max_count=max_queries)


async def analyze_search_intent(
    user_query: str,
    *,
    api_key: str,
    subscription_tier: str,
    max_queries: int = 5,
    pre_search_reasoning: str = "",
) -> dict[str, Any]:
    """LLM: понять запрос и сформировать короткие поисковые фразы."""
    if not api_key or not (user_query or "").strip():
        qs = expand_heuristic_queries(user_query, max_queries=max_queries)
        return {"intent": (user_query or "")[:200], "queries": qs}

    system = (
        "Ты аналитик поисковых запросов Nexus. Ответь ТОЛЬКО JSON без markdown:\n"
        '{"intent":"кратко что ищет пользователь (1-2 предложения RU)",'
        '"queries":["короткая фраза для Google/DDG", ...]}\n'
        "Правила:\n"
        f"- queries: {max(2, min(max_queries, 5))} РАЗНЫХ коротких строк (до 80 символов), без копирования всего вопроса.\n"
        "- Исправляй опечатки имён (Кастория → Castorice).\n"
        "- RU + EN где уместно (игры, персонажи, техника).\n"
        "- Каждый query — отдельный угол: факты, гайд/билд, wiki, новости.\n"
        "- Приоритет свежих данных: добавляй latest, current, 2025 или 2026 где уместно.\n"
        "- Не дублируй одинаковые queries."
    )
    reasoning_block = ""
    if (pre_search_reasoning or "").strip():
        reasoning_block = f"\nРассуждение модели перед поиском:\n{pre_search_reasoning.strip()[:1500]}\n"
    user = f"Сообщение пользователя:\n{user_query.strip()}{reasoning_block}"
    try:
        model = await models_catalog.get_default_model(subscription_tier, prefer="cheap")
    except Exception:
        model = "openai/gpt-4o-mini"
    raw = await _call_planner_llm(
        api_key,
        model,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    data = _parse_planner_json(raw)
    intent = str(data.get("intent") or "").strip() or user_query[:200]
    raw_q = data.get("queries") or []
    if not isinstance(raw_q, list):
        raw_q = []
    queries = normalize_search_queries(
        [str(q).strip() for q in raw_q if str(q).strip()],
        max_count=max_queries,
    )
    if not queries:
        queries = expand_heuristic_queries(user_query, max_queries=max_queries)
    for extra in _freshness_query_suffix(user_query):
        if extra.lower() not in {q.lower() for q in queries}:
            queries.append(extra)
    queries = normalize_search_queries(queries, max_count=max_queries)
    return {"intent": intent, "queries": queries}


def _pack_sources_for_prompt(
    ranked: list[dict], *, source_cap: int | None = None
) -> tuple[list[dict], str]:
    """Топ источников в лимит символов для system prompt."""
    cap_n = source_cap if source_cap is not None else WEB_SEARCH_TARGET_SOURCES
    picked: list[dict] = []
    total = 0
    for r in ranked:
        block_len = len(r.get("title", "")) + len(r.get("url", "")) + min(
            len(r.get("snippet") or ""), WEB_SEARCH_SNIPPET_MAX_CHARS
        ) + 40
        if picked and total + block_len > WEB_SEARCH_PROMPT_MAX_CHARS:
            break
        picked.append(r)
        total += block_len
        if len(picked) >= cap_n:
            break
    text = format_sources_for_prompt(picked, snippet_max=WEB_SEARCH_SNIPPET_MAX_CHARS)
    if len(text) > WEB_SEARCH_PROMPT_MAX_CHARS:
        while len(picked) > 5 and len(text) > WEB_SEARCH_PROMPT_MAX_CHARS:
            picked.pop()
            text = format_sources_for_prompt(picked, snippet_max=WEB_SEARCH_SNIPPET_MAX_CHARS)
    return picked, text


def _parse_planner_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {"action": "search_more", "queries": [], "reason": "empty"}
    # Вырезать ```json ... ```
    if "```" in text:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
        if m:
            text = m.group(1).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    # Попытка найти объект
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return {"action": "search_more", "queries": [], "reason": "parse_failed"}


def _planner_chat_url(api_key: str) -> tuple[str, bool]:
    is_openrouter = (api_key or "").strip().lower().startswith("sk-or-")
    base_url = OPENROUTER_BASE_URL if is_openrouter else POLZA_BASE_URL
    return f"{base_url.rstrip('/')}/chat/completions", is_openrouter


async def _call_planner_llm(api_key: str, model: str, messages: list[dict]) -> str:
    url, is_openrouter = _planner_chat_url(api_key)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if is_openrouter:
        if OPENROUTER_HTTP_REFERER:
            headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER
        if OPENROUTER_APP_TITLE:
            headers["X-Title"] = OPENROUTER_APP_TITLE
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 600,
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        res = await client.post(url, headers=headers, json=payload)
    if res.status_code != 200:
        logger.warning("planner LLM %s: %s", res.status_code, res.text[:300])
        return ""
    data = res.json()
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    return (msg.get("content") or "").strip()


async def run_planner(
    *,
    user_query: str,
    sources: list[dict],
    round_index: int,
    api_key: str,
    subscription_tier: str,
    target_sources: int = WEB_SEARCH_TARGET_SOURCES,
) -> dict[str, Any]:
    ranked = rank_sources(user_query, sources)
    top = ranked[:12]
    summaries = "\n".join(
        f"- {s.get('title', '')[:80]} | {(s.get('snippet') or '')[:120]}"
        for s in top
    )
    target = target_sources
    system = (
        "Ты планировщик веб-поиска Nexus. Ответь ТОЛЬКО JSON без markdown:\n"
        '{"action":"search_more"|"confirm"|"answer","queries":["..."],"reason":"..."}\n'
        "Правила:\n"
        f"- Сейчас {len(sources)} уникальных источников, цель {target}+.\n"
        "- action=search_more: мало данных или тема сложная — 2-4 новых поисковых запроса на EN/RU.\n"
        "- action=confirm: в топ-10 уже есть ответ — 1-2 узких запроса для подтверждения фактов.\n"
        f"- action=answer: достаточно (>={target}) релевантных источников.\n"
        "- Для опечаток имён (Castoria→Castorice) добавь исправленные запросы.\n"
        "- queries максимум 5 коротких строк; приоритет свежих данных (latest, 2025, 2026).\n"
    )
    user = (
        f"Вопрос пользователя: {user_query}\n"
        f"Раунд: {round_index}\n"
        f"Топ источников:\n{summaries or '(пусто)'}"
    )
    try:
        model = await models_catalog.get_default_model(subscription_tier, prefer="cheap")
    except Exception:
        model = "openai/gpt-4o-mini"
    raw = await _call_planner_llm(
        api_key,
        model,
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    plan = _parse_planner_json(raw)
    action = str(plan.get("action") or "search_more").strip().lower()
    if action not in ("search_more", "confirm", "answer"):
        action = "search_more"
    queries = plan.get("queries") or []
    if not isinstance(queries, list):
        queries = []
    queries = [str(q).strip() for q in queries if str(q).strip()][:5]
    return {"action": action, "queries": queries, "reason": str(plan.get("reason") or "")}


def _heuristic_plan(
    sources: list[dict],
    round_index: int,
    *,
    target_sources: int,
    answer_min_sources: int,
) -> dict[str, Any]:
    n = len(sources)
    if n >= target_sources:
        return {"action": "answer", "queries": [], "reason": "heuristic_target_met"}
    if n >= answer_min_sources and round_index >= 2:
        return {"action": "answer", "queries": [], "reason": "heuristic_enough"}
    if n >= max(4, answer_min_sources - 2) and round_index >= 1:
        return {"action": "confirm", "queries": [], "reason": "heuristic_confirm"}
    return {"action": "search_more", "queries": [], "reason": "heuristic_need_more"}


async def _merge_search(
    user_query: str,
    all_sources: list[dict],
    batch: list[dict],
    cap: int,
) -> list[dict]:
    return rank_sources(user_query, dedupe_sources(all_sources + batch))[:cap]


async def run_web_search_session(
    user_query: str,
    *,
    api_key: str,
    subscription_tier: str,
    max_sources: int | None = None,
    max_rounds: int | None = None,
    depth: str | None = None,
    pre_search_reasoning: str = "",
    on_progress: ProgressCallback | None = None,
) -> tuple[list[dict], list[dict], str, dict[str, Any]]:
    """Возвращает (all_sources_for_ui, sources_for_prompt, engine, meta)."""
    import time as _time

    preset: WebSearchDepthPreset = resolve_web_search_depth(depth)
    cap = max_sources if max_sources is not None else preset.max_sources
    cap = min(cap, WEB_SEARCH_MAX_SOURCES)
    rounds_limit = max_rounds if max_rounds is not None else preset.max_rounds
    rounds_limit = min(rounds_limit, WEB_SEARCH_MAX_ROUNDS)
    deadline = _time.monotonic() + min(preset.max_seconds, WEB_SEARCH_MAX_SECONDS)
    target = preset.target_sources
    per_query = preset.per_query_limit
    engine = "DuckDuckGo"
    all_sources: list[dict] = []
    rounds_meta: list[dict] = []
    used_queries: set[str] = set()
    _t0 = _time.monotonic()

    def over_budget() -> bool:
        return _time.monotonic() >= deadline

    async def emit(payload: dict[str, Any]) -> None:
        if on_progress:
            result = on_progress(payload)
            if result is not None and hasattr(result, "__await__"):
                await result

    async def execute_queries(queries: list[str], round_index: int, phase: str) -> None:
        nonlocal engine, all_sources
        if over_budget():
            return
        fresh = normalize_search_queries(
            [q for q in queries if q.lower() not in used_queries],
            max_count=8,
        )
        if not fresh:
            return
        for q in fresh:
            used_queries.add(q.lower())
        await emit(
            {
                "type": "search_round",
                "round": round_index,
                "max_rounds": rounds_limit,
                "queries": fresh,
                "sources_total": len(all_sources),
                "phase": phase,
                "depth": preset.id,
            }
        )
        batch, eng = await search_many_parallel(fresh, per_query_limit=per_query)
        if eng and eng != "none":
            engine = eng
        all_sources = await _merge_search(user_query, all_sources, batch, cap)
        await emit(
            {
                "type": "search_round",
                "round": round_index,
                "max_rounds": rounds_limit,
                "sources_total": len(all_sources),
                "phase": "merge",
                "depth": preset.id,
            }
        )

    # Шаг 0: анализ запроса → короткие поисковые фразы
    intent_text = ""
    if api_key:
        try:
            analyzed = await analyze_search_intent(
                user_query,
                api_key=api_key,
                subscription_tier=subscription_tier,
                max_queries=preset.max_heuristic_queries,
                pre_search_reasoning=pre_search_reasoning,
            )
            intent_text = analyzed.get("intent") or ""
            initial_queries = analyzed.get("queries") or []
        except Exception as exc:
            logger.warning("search intent analyze failed: %s", exc)
            initial_queries = expand_heuristic_queries(
                user_query, max_queries=preset.max_heuristic_queries
            )
    else:
        initial_queries = expand_heuristic_queries(
            user_query, max_queries=preset.max_heuristic_queries
        )

    if not initial_queries:
        initial_queries = expand_heuristic_queries(
            user_query, max_queries=preset.max_heuristic_queries
        )

    await emit(
        {
            "type": "search_plan",
            "phase": "analyze",
            "intent": intent_text or user_query[:240],
            "queries": initial_queries,
            "depth": preset.id,
        }
    )

    await execute_queries(initial_queries, 1, "search")

    if not preset.use_planner:
        rounds_meta.append(
            {
                "round": 1,
                "action": "quick",
                "sources": len(all_sources),
                "reason": "depth_quick",
            }
        )
        ranked = rank_sources(user_query, all_sources)
        prompt_sources, _ = _pack_sources_for_prompt(
            ranked, source_cap=preset.prompt_source_cap
        )
        meta = {
            "rounds": rounds_meta,
            "total_sources": len(ranked),
            "prompt_sources": len(prompt_sources),
            "engine": engine,
            "elapsed_ms": int((_time.monotonic() - _t0) * 1000),
            "depth": preset.id,
        }
        return ranked[:cap], prompt_sources, engine or "DuckDuckGo", meta

    for round_index in range(1, rounds_limit + 1):
        if over_budget():
            break
        if len(all_sources) >= cap:
            break
        if round_index > 2 and len(all_sources) == 0:
            break

        if api_key:
            try:
                plan = await run_planner(
                    user_query=user_query,
                    sources=all_sources,
                    round_index=round_index,
                    api_key=api_key,
                    subscription_tier=subscription_tier,
                    target_sources=target,
                )
            except Exception as exc:
                logger.warning("planner failed: %s", exc)
                plan = _heuristic_plan(
                    all_sources,
                    round_index,
                    target_sources=target,
                    answer_min_sources=preset.answer_min_sources,
                )
        else:
            plan = _heuristic_plan(
                all_sources,
                round_index,
                target_sources=target,
                answer_min_sources=preset.answer_min_sources,
            )

        action = str(plan.get("action") or "search_more").lower()
        if action not in ("search_more", "confirm", "answer"):
            action = "search_more"

        rounds_meta.append(
            {
                "round": round_index,
                "action": action,
                "sources": len(all_sources),
                "reason": plan.get("reason"),
            }
        )

        if action == "answer" and len(all_sources) >= min(
            preset.answer_min_sources, target
        ):
            break

        planner_queries = [str(q).strip() for q in (plan.get("queries") or []) if str(q).strip()]
        if action == "confirm" and not planner_queries:
            planner_queries = [
                f"{user_query} подтверждение",
                f"{user_query} официальный сайт",
            ]
        if not planner_queries and len(all_sources) < target:
            extra = expand_heuristic_queries(
                user_query, max_queries=min(4, preset.max_heuristic_queries)
            )
            planner_queries = [q for q in extra if q.lower() not in used_queries][:3]

        if not planner_queries:
            if len(all_sources) >= target:
                break
            continue

        phase = "confirm" if action == "confirm" else "search_more"
        await execute_queries(planner_queries, round_index + 1, phase)

        if action == "answer":
            break
        if len(all_sources) >= target and action != "search_more":
            if preset.max_rounds >= 2:
                await execute_queries(
                    [f"{user_query} verify facts"],
                    round_index + 1,
                    "confirm",
                )
            break

    ranked = rank_sources(user_query, all_sources)
    prompt_sources, _ = _pack_sources_for_prompt(
        ranked, source_cap=preset.prompt_source_cap
    )
    meta = {
        "rounds": rounds_meta,
        "total_sources": len(ranked),
        "prompt_sources": len(prompt_sources),
        "engine": engine,
        "elapsed_ms": int((_time.monotonic() - _t0) * 1000),
        "depth": preset.id,
    }
    return ranked[:cap], prompt_sources, engine or "DuckDuckGo", meta
