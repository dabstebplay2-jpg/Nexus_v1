"""Веб-поиск для обычного чата и глубокого Research."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.config import (
    WEB_SEARCH_CHAT_MAX_ROUNDS,
    WEB_SEARCH_DEEP_MAX_SOURCES,
    WEB_SEARCH_MAX_SOURCES,
)
from app.schemas import ChatAttachment, ChatMessage, SimpleChatRequest
from app.services.conversation_sources import (
    merge_conversation_sources,
    sanitize_conversation_sources,
    sources_context_note,
)
from app.services.web_search import format_sources_for_prompt
from app.services.web_search_agent import (
    _pack_sources_for_prompt,
    rank_sources,
    run_web_search_session,
)
from app.services.web_search_depth import resolve_web_search_depth

DEEP_RESEARCH_DEFAULT_MODEL = "perplexity/sonar-deep-research"

ProgressCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


def extract_last_user_text(
    messages: list[ChatMessage],
    attachments: list[ChatAttachment] | None = None,
) -> str:
    text = ""
    for msg in reversed(messages or []):
        if msg.role != "user":
            continue
        if isinstance(msg.content, str):
            text = msg.content.strip()
        break
    if not text and attachments:
        names = ", ".join(a.name for a in attachments[:3] if a.name)
        if names:
            text = f"Вложения: {names}"
    return text


def inject_web_search_system(
    messages: list[dict[str, Any]],
    system_content: str,
) -> list[dict[str, Any]]:
    if not system_content:
        return messages
    if messages and messages[0].get("role") == "system":
        merged = f"{messages[0].get('content', '')}\n\n{system_content}".strip()
        return [{"role": "system", "content": merged}, *messages[1:]]
    return [{"role": "system", "content": system_content}, *messages]


def build_web_search_system_content(
    results: list[dict],
    engine: str,
    *,
    deep: bool = False,
    search_failed: bool = False,
    meta: dict[str, Any] | None = None,
    for_thinking: bool = False,
) -> str:
    meta = meta or {}
    rounds = meta.get("rounds") or []
    total = meta.get("total_sources") or len(results)
    prompt_n = meta.get("prompt_sources") or len(results)

    if search_failed or not results:
        return (
            "Поиск в интернете не дал результатов (DuckDuckGo). Ответь по своим знаниям и укажи, "
            "что актуальные данные из сети недоступны. Не выдумывай URL."
        )

    sources_block = format_sources_for_prompt(results)
    rounds_note = f"Выполнено раундов поиска: {len(rounds) or 1}. " if rounds else ""
    prior_count = int(meta.get("prior_sources_count") or 0)
    ctx_note = sources_context_note(prior_count, total)
    preamble = (
        f"Nexus уже выполнил веб-поиск ({engine}). {rounds_note}"
        f"Найдено {total} уникальных ссылок; ниже топ-{prompt_n} по релевантности. "
        "У тебя ЕСТЬ доступ к этим результатам — не пиши, что нет интернета. "
        "Цитируй [1], [2]… только из списка; не выдумывай URL.\n"
        "Предпочитай более свежие факты; если данные могли устареть — укажи это.\n"
        + ctx_note
    )
    if for_thinking:
        preamble += (
            "Если включено рассуждение: в reasoning опиши план и сверку фактов по номерам [n], "
            "без полного перечня URL — ссылки покажет интерфейс. "
            "В основном ответе — структурированный текст с цитатами [1], [2]…\n"
        )

    no_dup = (
        "Не выводи в ответе и в reasoning полный список ссылок или блок «Источники» — "
        "только цитаты [n] в тексте; полный список URL покажет интерфейс.\n"
    )

    if deep:
        body = (
            "Составь развёрнутый отчёт:\n"
            "1) Краткий вывод (2–4 предложения)\n"
            "2) Разделы с подзаголовками\n"
            "3) Цитаты [n] в тексте\n\n"
            + no_dup
        )
    else:
        body = (
            "Дай полный ответ на вопрос пользователя. "
            "Используй цитаты [1], [2]… в тексте.\n"
            + no_dup
        )

    return preamble + body + f"Источники ({engine}):\n{sources_block}"


async def run_web_search_for_chat(
    payload: SimpleChatRequest,
    router_messages: list[dict[str, Any]],
    *,
    api_key: str,
    subscription_tier: str,
    deep: bool = False,
    search_depth: str | None = None,
    pre_search_reasoning: str = "",
    on_progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], list[dict], str, dict[str, Any]]:
    query = extract_last_user_text(payload.messages, payload.attachments)
    if not query:
        return router_messages, [], "", {}

    prior_raw = [
        {"title": s.title, "url": s.url, "snippet": s.snippet}
        for s in (payload.conversation_sources or [])
    ]
    prior_sanitized = sanitize_conversation_sources(prior_raw)

    max_sources = WEB_SEARCH_DEEP_MAX_SOURCES if deep else WEB_SEARCH_MAX_SOURCES
    depth = search_depth if not deep else "deep"
    new_sources, prompt_slice, engine, meta = await run_web_search_session(
        query,
        api_key=api_key,
        subscription_tier=subscription_tier,
        max_sources=max_sources,
        max_rounds=WEB_SEARCH_CHAT_MAX_ROUNDS if not deep else None,
        depth=depth,
        pre_search_reasoning=pre_search_reasoning,
        on_progress=on_progress,
    )

    merged, prior_count = merge_conversation_sources(prior_sanitized, new_sources)
    ranked_merged = rank_sources(query, merged)
    preset = resolve_web_search_depth(depth)
    prompt_sources, _ = _pack_sources_for_prompt(
        ranked_merged, source_cap=preset.prompt_source_cap
    )
    all_sources = ranked_merged[: preset.max_sources]

    failed = len(all_sources) == 0
    meta = {
        **meta,
        "total_sources": len(all_sources),
        "prompt_sources": len(prompt_sources),
        "prior_sources_count": prior_count,
    }
    system_content = build_web_search_system_content(
        prompt_sources,
        engine or "none",
        deep=deep,
        search_failed=failed,
        meta=meta,
        for_thinking=True,
    )
    enriched = inject_web_search_system(router_messages, system_content)
    return enriched, all_sources, engine or "", meta


# Совместимость со старым именем
async def prepare_simple_chat_web_search(
    payload: SimpleChatRequest,
    router_messages: list[dict[str, Any]],
    *,
    api_key: str = "",
    subscription_tier: str = "STANDARD",
    on_progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], list[dict], str]:
    if not api_key:
        # Без ключа планировщик недоступен — только эвристики через session с пустым ключом
        api_key = ""
    enriched, sources, engine, _meta = await run_web_search_for_chat(
        payload,
        router_messages,
        api_key=api_key,
        subscription_tier=subscription_tier,
        deep=False,
        on_progress=on_progress,
    )
    return enriched, sources, engine


async def web_search_deep(query: str, limit: int = 10) -> tuple[list[dict], str]:
    """Legacy: быстрый multi-query без планировщика."""
    from app.services.web_search import search_many_parallel
    from app.services.web_search_agent import dedupe_sources, expand_heuristic_queries, rank_sources

    queries = expand_heuristic_queries(query)
    results, engine = await search_many_parallel(
        queries, per_query_limit=max(12, limit // max(1, len(queries)))
    )
    ranked = rank_sources(query, dedupe_sources(results))[:limit]
    return ranked, engine


async def web_search_quick(query: str, limit: int = 5) -> tuple[list[dict], str]:
    from app.services.web_search import web_search

    return await web_search(query, limit=limit)


def expand_deep_search_queries(query: str) -> list[str]:
    """2–3 поисковых запроса (legacy research)."""
    from app.services.web_search_agent import expand_heuristic_queries

    return expand_heuristic_queries(query)[:3]
