"""Накопленные источники веб-поиска в рамках одного диалога."""

from __future__ import annotations

from typing import Any


def _norm_url(url: str) -> str:
    return (url or "").strip().lower().rstrip("/")


def sanitize_source_item(raw: dict[str, Any]) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    url = (raw.get("url") or "").strip()
    if not url or "duckduckgo.com" in url.lower():
        return None
    title = (raw.get("title") or url).strip()
    snippet = (raw.get("snippet") or title).strip()
    return {"title": title[:500], "url": url[:2000], "snippet": snippet[:2000]}


def sanitize_conversation_sources(items: list[dict] | None, *, max_items: int = 80) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for raw in items or []:
        item = sanitize_source_item(raw)
        if not item:
            continue
        key = _norm_url(item["url"])
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= max_items:
            break
    return out


def merge_conversation_sources(
    prior: list[dict],
    new_batch: list[dict],
    *,
    max_total: int = 80,
) -> tuple[list[dict], int]:
    """Объединяет старые источники чата с новыми; prior_count = число до merge."""
    merged = sanitize_conversation_sources(prior, max_items=max_total)
    prior_count = len(merged)
    seen = {_norm_url(s["url"]) for s in merged}
    for raw in new_batch or []:
        item = sanitize_source_item(raw)
        if not item:
            continue
        key = _norm_url(item["url"])
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= max_total:
            break
    return merged, prior_count


def sources_context_note(prior_count: int, total: int) -> str:
    if prior_count <= 0:
        return ""
    new_count = max(0, total - prior_count)
    if new_count > 0:
        return (
            f"В этом диалоге уже были источники [1]–[{prior_count}]; "
            f"новый поиск добавил [{prior_count + 1}]–[{total}]. "
            "На уточняющие вопросы сначала опирайся на уже найденное, новые — для дополнения и актуализации. "
            "Цитируй любой номер из полного списка ниже.\n"
        )
    return (
        f"В этом диалоге уже есть источники [1]–[{prior_count}] — используй их для ответа. "
        "Новый поиск не добавил уникальных ссылок.\n"
    )
