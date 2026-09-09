import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

LOCALES_DIR = Path(__file__).resolve().parent.parent / "ui" / "locales"

_current_language = "ru"
_translations: dict[str, str] = {}
_fallback: dict[str, str] = {}


def detect_os_language() -> str:
    return "ru"


def _load_locale(lang: str) -> dict[str, str]:
    path = LOCALES_DIR / f"{lang}.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("Failed to load locale %s: %s", lang, e)
        return {}


def set_language(lang: str):
    global _current_language, _translations
    _current_language = "ru"
    _translations = _load_locale("ru")
    _fallback.clear()


def get_language() -> str:
    return _current_language


def tr(key: str, default: str = "") -> str:
    val = _translations.get(key)
    if val is not None:
        return val
    val = _fallback.get(key)
    if val is not None:
        return val
    return default or key


def translate_widget(widget, key: str, default: str):
    """Apply translation to a widget's text."""
    widget.setText(tr(key, default))


set_language("ru")
