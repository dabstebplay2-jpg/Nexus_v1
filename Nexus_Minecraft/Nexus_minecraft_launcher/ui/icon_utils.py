from pathlib import Path
from PySide6.QtGui import QIcon

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = PROJECT_ROOT / "assets" / "icons"


def icon(name: str) -> QIcon:
    path = ICON_DIR / f"{name}.svg"
    return QIcon(str(path))
