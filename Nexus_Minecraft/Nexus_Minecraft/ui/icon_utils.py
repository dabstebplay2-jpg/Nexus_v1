from pathlib import Path

from PySide6.QtGui import QIcon

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = PROJECT_ROOT / "assets"
ICON_DIR = ASSET_DIR / "icons"


def _resolve_icon_path(name: str) -> Path | None:
    for ext in ("png", "ico", "svg"):
        path = ICON_DIR / f"{name}.{ext}"
        if path.exists():
            return path

    fallback = ASSET_DIR / f"{name}.ico"
    if fallback.exists():
        return fallback

    return None


def icon(name: str, size: int = 24) -> QIcon:
    """Load launcher icon by name."""
    path = _resolve_icon_path(name)
    if not path:
        return QIcon()
    return QIcon(str(path))
