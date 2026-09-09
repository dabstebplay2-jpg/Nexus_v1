"""Безопасный первичный роутинг встроенных инструментов Nexus."""

from __future__ import annotations

import re
from dataclasses import dataclass

_IMAGE_OBJECT_RE = re.compile(
    r"(?:изображени[еяю]|картин(?:ка|ку|ки|ок)|рисун(?:ок|ка)|иллюстраци[яюи]|"
    r"фото(?:графи[яюи])?|image|picture|illustration|artwork|poster|wallpaper)",
    re.I,
)
_IMAGE_ACTION_RE = re.compile(
    r"(?:нарисуй|изобрази|сгенерируй|создай|сделай|отрисуй|generate|create|draw|"
    r"paint|make|design)",
    re.I,
)
_DIRECT_IMAGE_RE = re.compile(
    r"(?:нарисуй|изобрази|сгенерируй\s+(?:мне\s+)?(?:картин|изображ|фото|рисун)|"
    r"generate\s+(?:an?\s+)?(?:image|picture|illustration)|draw\s+)",
    re.I,
)
_EXPLANATION_RE = re.compile(
    r"^(?:как|зачем|почему|что\s+такое|объясни|расскажи|how\s+to|why|what\s+is)\b",
    re.I,
)
_NEGATION_RE = re.compile(
    r"(?:не\s+(?:рисуй|создавай|генерируй|делай)|do\s+not\s+(?:draw|create|generate))",
    re.I,
)
_SEARCH_IMAGE_RE = re.compile(
    r"(?:найди|поищи|покажи\s+из\s+интернета|find|search\s+for|look\s+up)",
    re.I,
)


@dataclass(frozen=True)
class AutoToolIntent:
    image_generation: bool = False
    reason: str = "none"


def detect_image_generation_intent(user_text: str) -> bool:
    """Отличает просьбу создать картинку от поиска/анализа/объяснения."""
    text = re.sub(r"\s+", " ", (user_text or "").strip())
    if not text or _NEGATION_RE.search(text):
        return False
    if _EXPLANATION_RE.search(text) or _SEARCH_IMAGE_RE.search(text):
        return False
    if _DIRECT_IMAGE_RE.search(text):
        return True
    return bool(_IMAGE_ACTION_RE.search(text) and _IMAGE_OBJECT_RE.search(text))


def route_explicit_tools(user_text: str) -> AutoToolIntent:
    if detect_image_generation_intent(user_text):
        return AutoToolIntent(image_generation=True, reason="explicit_image_generation")
    return AutoToolIntent()
