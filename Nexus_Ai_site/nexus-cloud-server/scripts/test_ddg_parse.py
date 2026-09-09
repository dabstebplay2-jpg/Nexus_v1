"""Quick DDG parse smoke test."""
import asyncio
import re

from app.services.web_search import (
    _fetch_ddg_html,
    _parse_ddg_html_page,
    search_duckduckgo_paginated,
    search_many_parallel,
)


async def main() -> None:
    import httpx

    q = "Castoria Honkai Star Rail"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8",
    }
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        r = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": q},
            headers=headers,
        )
    print("raw status", r.status_code, "len", len(r.text), "url", str(r.url)[:80])
    html = await _fetch_ddg_html(q, 0)
    print("html len", len(html))
    seen: set[str] = set()
    parsed = _parse_ddg_html_page(html, 15, seen)
    print("html parsed", len(parsed))
    if parsed:
        print("first", parsed[0])
    blocks = re.findall(r'class="[^"]*result[^"]*"', html[:8000])
    print("result-ish classes (sample):", blocks[:5])
    for pat in ["result__a", "result__snippet", "result-link", "results_links"]:
        print(pat, "count", html.count(pat))
    idx = html.find("result__a")
    if idx < 0:
        idx = html.find("results_links")
    if idx >= 0:
        print("snippet around hit:\n", html[max(0, idx - 100) : idx + 600])
    paginated = await search_duckduckgo_paginated(q, limit=10)
    print("paginated", len(paginated))
    parallel, eng = await search_many_parallel([q, "кастория honkai star rail"], per_query_limit=10)
    print("parallel", len(parallel), eng)


if __name__ == "__main__":
    asyncio.run(main())
