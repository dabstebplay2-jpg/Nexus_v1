"""System prompt for Nexus Browser agent loop."""

from __future__ import annotations

from typing import Any

from app.schemas import BrowserAgentStep

BROWSER_AGENT_TOOLS = """Доступные инструменты браузера (ответь блоком ```nexus-browser-tool с JSON):
{"tool":"browser_navigate","args":{"url":"https://..."}}
{"tool":"browser_click","args":{"selector":"button.submit"}}
{"tool":"browser_type","args":{"selector":"input#email","text":"..."}}
{"tool":"browser_scroll","args":{"deltaY":400}}
{"tool":"browser_snapshot","args":{}}
{"tool":"browser_tabs_list","args":{}}
Один или несколько JSON в массиве. Действия выполняются локально на устройстве пользователя."""


def inject_browser_agent_prompt(
    messages: list[dict[str, Any]],
    prior_steps: list[BrowserAgentStep] | None = None,
) -> list[dict[str, Any]]:
    system_parts = [
        "Ты агент Nexus Browser. Помогай пользователю с веб-страницами.",
        BROWSER_AGENT_TOOLS,
        "Не запрашивай пароли и платёжные данные. На банковских сайтах только читай и объясняй.",
    ]
    if prior_steps:
        lines = []
        for step in prior_steps[-12:]:
            lines.append(f"- {step.tool}({step.args}): {(step.result or '')[:2000]}")
        system_parts.append("Результаты предыдущих шагов:\n" + "\n".join(lines))
    out = [{"role": "system", "content": "\n\n".join(system_parts)}]
    out.extend(messages)
    return out
