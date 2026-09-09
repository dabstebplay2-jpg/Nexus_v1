"""Inject browser page context into chat messages."""

from __future__ import annotations

from typing import Any

from app.schemas import BrowserPageContext

MAX_EXCERPT = 32_000
MAX_SELECTION = 8_000


def sanitize_page_context(ctx: BrowserPageContext | None) -> BrowserPageContext | None:
    if ctx is None:
        return None
    excerpt = (ctx.excerpt or "").strip()[:MAX_EXCERPT]
    selection = (ctx.selection or "").strip()[:MAX_SELECTION] if ctx.selection else None
    title = (ctx.title or "").strip()[:500]
    url = (ctx.url or "").strip()[:2000]
    if not url and not excerpt and not title:
        return None
    return BrowserPageContext(
        url=url,
        title=title,
        excerpt=excerpt,
        selection=selection,
        tab_id=ctx.tab_id,
    )


def build_page_context_system(ctx: BrowserPageContext) -> str:
    parts = [
        "Контекст открытой вкладки браузера Nexus (только текст страницы, без cookies и паролей).",
        f"URL: {ctx.url or '—'}",
        f"Заголовок: {ctx.title or '—'}",
    ]
    if ctx.selection:
        parts.append(f"Выделение пользователя:\n{ctx.selection}")
    if ctx.excerpt:
        parts.append(f"Текст страницы (фрагмент):\n{ctx.excerpt}")
    return "\n".join(parts)


def inject_page_context_messages(
    messages: list[dict[str, Any]],
    ctx: BrowserPageContext | None,
) -> list[dict[str, Any]]:
    clean = sanitize_page_context(ctx)
    if not clean:
        return messages
    system = build_page_context_system(clean)
    out = [{"role": "system", "content": system}]
    out.extend(messages)
    return out
