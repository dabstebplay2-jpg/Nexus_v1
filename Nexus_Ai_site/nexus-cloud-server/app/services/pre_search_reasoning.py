"""Фаза reasoning основной модели до веб-поиска."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

PRE_SEARCH_SYSTEM = (
    "Фаза планирования Nexus (только reasoning, без ответа пользователю).\n"
    "Кратко разбери последний вопрос: что именно нужно, какие факты проверить в интернете, "
    "какие гипотезы и уточнения важны. Укажи, какие свежие данные (актуальные на 2025–2026) нужны.\n"
    "Не пиши финальный ответ пользователю — только внутреннее рассуждение."
)


def build_pre_search_payload(router_body: dict[str, Any]) -> dict[str, Any]:
    messages = list(router_body.get("messages") or [])
    if messages and messages[0].get("role") == "system":
        merged = f"{messages[0].get('content', '')}\n\n{PRE_SEARCH_SYSTEM}".strip()
        messages = [{"role": "system", "content": merged}, *messages[1:]]
    else:
        messages = [{"role": "system", "content": PRE_SEARCH_SYSTEM}, *messages]
    return {
        **router_body,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": 900,
    }


def _parse_sse_data(line: str) -> dict | None:
    line = line.strip()
    if not line.startswith("data:"):
        return None
    body = line[5:].strip()
    if not body or body == "[DONE]":
        return None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


async def iter_pre_search_reasoning(
    stream_tokens_fn,
    api_key: str,
    router_body: dict[str, Any],
) -> AsyncIterator[tuple[str | None, str]]:
    """
    Yields (sse_line_or_none, reasoning_delta).
    После завершения генератора caller собирает reasoning из deltas.
    """
    payload = build_pre_search_payload(router_body)
    async for item in stream_tokens_fn(api_key, payload):
        if isinstance(item, dict):
            continue
        for line in item.split("\n"):
            data = _parse_sse_data(line)
            if not data:
                continue
            t = data.get("type")
            content = data.get("content") or ""
            if not content:
                continue
            if t == "thinking":
                yield (
                    f"data: {json.dumps({'type': 'thinking', 'content': content}, ensure_ascii=False)}\n\n",
                    content,
                )
            elif t == "token":
                yield (None, content)
