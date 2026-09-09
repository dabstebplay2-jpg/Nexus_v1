"""Веб-поиск: Tavily (если ключ) → DDGS (metasearch) → DuckDuckGo HTML/Lite."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from html import unescape
from urllib.parse import unquote

import httpx

logger = logging.getLogger(__name__)
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

# Один поток DDGS — библиотека синхронная; снижает rate-limit при parallel gather.
_DDG_LOCK = asyncio.Lock()

_DDG_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8",
}

_BLOCK_RE = re.compile(r'<div class="[^"]*result[^"]*"[^>]*>([\s\S]*?)</div>\s*</div>', re.I)
_LINK_RE = re.compile(r'<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', re.I)
_SNIPPET_RE_A = re.compile(r'<a class="result__snippet"[^>]*>([\s\S]*?)</a>', re.I)
_SNIPPET_RE_DIV = re.compile(r'<div class="result__snippet"[^>]*>([\s\S]*?)</div>', re.I)


def _strip_html(text: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", text or "").strip())


def _parse_ddg_html_block(block: str) -> dict | None:
    link_m = _LINK_RE.search(block)
    if not link_m:
        return None
    raw_url = link_m.group(1)
    if "uddg=" in raw_url:
        raw_url = unquote(raw_url.split("uddg=", 1)[1].split("&")[0])
    title = _strip_html(link_m.group(2))
    snippet_m = _SNIPPET_RE_A.search(block) or _SNIPPET_RE_DIV.search(block)
    snippet = _strip_html(snippet_m.group(1)) if snippet_m else ""
    if not raw_url or not title or "duckduckgo.com" in raw_url:
        return None
    return {"title": title, "url": raw_url, "snippet": snippet or title}


def _parse_ddg_html_page(html: str, limit: int, seen: set[str]) -> list[dict]:
    results: list[dict] = []
    for match in _BLOCK_RE.finditer(html):
        if len(results) >= limit:
            break
        item = _parse_ddg_html_block(match.group(1))
        if not item:
            continue
        url = item["url"]
        if url in seen:
            continue
        seen.add(url)
        results.append(item)
    return results


async def _fetch_ddg_html(query: str, offset: int = 0) -> str:
    params: dict[str, str | int] = {"q": query}
    if offset > 0:
        params["s"] = str(offset)
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.get(
            "https://html.duckduckgo.com/html/",
            params=params,
            headers=_DDG_HEADERS,
        )
    if response.status_code != 200:
        return ""
    return response.text


async def _fetch_ddg_lite(query: str) -> str:
    """Запасной HTML-интерфейс DDG Lite."""
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        response = await client.get(
            "https://lite.duckduckgo.com/lite/",
            params={"q": query},
            headers=_DDG_HEADERS,
        )
    if response.status_code != 200:
        return ""
    return response.text


def _parse_ddg_lite(html: str, limit: int, seen: set[str]) -> list[dict]:
    """Парсер таблицы lite.duckduckgo.com."""
    results: list[dict] = []
    # Строки: ссылка в <a class="result-link"> или просто <a href>
    row_re = re.compile(
        r'<a[^>]+href="(https?://[^"]+)"[^>]*>([\s\S]*?)</a>',
        re.I,
    )
    for m in row_re.finditer(html):
        if len(results) >= limit:
            break
        url = unquote(m.group(1))
        if "duckduckgo.com" in url or url in seen:
            continue
        title = _strip_html(m.group(2))
        if not title or len(title) < 3:
            continue
        seen.add(url)
        results.append({"title": title, "url": url, "snippet": title})
    return results


def _ddgs_text_sync(query: str, limit: int) -> list[dict]:
    """Синхронный поиск через пакет ddgs (обходит 403 HTML-скрапинга)."""
    q = (query or "").strip()
    if not q:
        return []
    cap = max(1, min(limit, 25))
    try:
        from ddgs import DDGS
    except ImportError:
        logger.warning("ddgs package not installed; pip install ddgs")
        return []
    try:
        raw = DDGS().text(q, max_results=cap)
        if not raw:
            return []
        out: list[dict] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            url = (item.get("href") or item.get("url") or "").strip()
            title = (item.get("title") or "").strip()
            snippet = (item.get("body") or item.get("snippet") or title).strip()
            if url and title and "duckduckgo.com" not in url:
                out.append({"title": title, "url": url, "snippet": snippet})
        return out
    except Exception as exc:
        logger.warning("ddgs search failed for %r: %s", q[:80], exc)
        return []


async def search_ddg_ddgs(query: str, limit: int = 15) -> list[dict]:
    async with _DDG_LOCK:
        return await asyncio.to_thread(_ddgs_text_sync, query, limit)


async def search_duckduckgo_page(query: str, offset: int = 0, limit: int = 15) -> list[dict]:
    seen: set[str] = set()
    html = await _fetch_ddg_html(query, offset)
    if html:
        return _parse_ddg_html_page(html, limit, seen)
    return []


async def search_duckduckgo_paginated(query: str, limit: int = 20) -> list[dict]:
    """DDGS → несколько страниц DDG HTML (s=0, 30, 60…)."""
    ddgs_hits = await search_ddg_ddgs(query, limit)
    if ddgs_hits:
        return ddgs_hits[:limit]

    seen: set[str] = set()
    combined: list[dict] = []
    offsets = (0, 30, 60, 90)
    for offset in offsets:
        if len(combined) >= limit:
            break
        html = await _fetch_ddg_html(query, offset)
        if not html:
            continue
        page = _parse_ddg_html_page(html, limit - len(combined), seen)
        if not page:
            break
        combined.extend(page)
    if len(combined) < max(5, limit // 3):
        lite_html = await _fetch_ddg_lite(query)
        if lite_html:
            lite = _parse_ddg_lite(lite_html, limit - len(combined), seen)
            combined.extend(lite)
    return combined[:limit]


async def search_tavily(query: str, limit: int = 5) -> list[dict]:
    if not TAVILY_API_KEY or TAVILY_API_KEY in ("MY_TAVILY_API_KEY", ""):
        return []
    cap = min(limit, 20)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": cap,
                },
            )
        if res.status_code != 200:
            return []
        return [
            {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
            for r in res.json().get("results", [])
            if r.get("url")
        ]
    except Exception as exc:
        logger.warning("Tavily failed: %s", exc)
        return []


async def search_duckduckgo(query: str, limit: int = 5) -> list[dict]:
    """Один запрос DDG с пагинацией (совместимость)."""
    return await search_duckduckgo_paginated(query, limit=limit)


async def web_search(query: str, limit: int = 5) -> tuple[list[dict], str]:
    results = await search_tavily(query, limit)
    if results:
        return results, "Tavily"
    results = await search_duckduckgo_paginated(query, limit=limit)
    if results:
        return results, "DuckDuckGo"
    return [], "none"


async def _search_one_query(query: str, per_query_limit: int) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    tavily = await search_tavily(q, per_query_limit)
    if tavily:
        return tavily
    return await search_duckduckgo_paginated(q, limit=per_query_limit)


async def search_many_parallel(
    queries: list[str],
    *,
    per_query_limit: int = 18,
    max_concurrent: int = 6,
) -> tuple[list[dict], str]:
    """Параллельный поиск по списку запросов с dedupe."""
    unique_queries: list[str] = []
    seen_q: set[str] = set()
    for raw in queries:
        q = (raw or "").strip()
        key = q.lower()
        if q and key not in seen_q:
            seen_q.add(key)
            unique_queries.append(q)

    if not unique_queries:
        return [], "none"

    sem = asyncio.Semaphore(max_concurrent)
    engine_holder = ["DuckDuckGo"]

    async def run(q: str) -> list[dict]:
        async with sem:
            try:
                tavily = await search_tavily(q, per_query_limit)
                if tavily:
                    engine_holder[0] = "Tavily"
                    return tavily
                return await search_duckduckgo_paginated(q, limit=per_query_limit)
            except Exception as exc:
                logger.warning(
                    "parallel search failed for %r: %s: %s",
                    q[:80],
                    type(exc).__name__,
                    exc or "(no message)",
                )
                return []

    batches = await asyncio.gather(*[run(q) for q in unique_queries], return_exceptions=True)
    seen_urls: set[str] = set()
    combined: list[dict] = []
    for q, batch in zip(unique_queries, batches):
        if isinstance(batch, Exception):
            logger.warning(
                "parallel search error for %r: %s: %s",
                q[:80],
                type(batch).__name__,
                batch or "(no message)",
            )
            continue
        for r in batch:
            url = (r.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            combined.append(r)
    if not combined:
        return [], "none"
    return combined, engine_holder[0]


def format_sources_for_prompt(results: list[dict], *, snippet_max: int = 400) -> str:
    lines = []
    for i, r in enumerate(results, 1):
        snippet = (r.get("snippet") or "")[:snippet_max]
        lines.append(
            f"[{i}] {r.get('title', '')}\nURL: {r.get('url', '')}\nSnippet: {snippet}\n"
        )
    return "\n".join(lines)
