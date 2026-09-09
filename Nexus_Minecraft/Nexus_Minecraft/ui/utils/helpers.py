from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLayout, QLabel


def elide_text(text: str, max_len: int = 28) -> str:
    text = str(text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max(0, max_len - 1)].rstrip() + "…"


def make_badge_label(text: str, object_name: str = "SmallBadge", max_len: int = 24) -> QLabel:
    full = str(text or "").strip()
    label = QLabel(elide_text(full, max_len))
    label.setObjectName(object_name)
    label.setToolTip(full if full != label.text() else "")
    label.setMaximumWidth(180)
    return label


def clear_layout(layout: QLayout):
    while layout.count():
        item = layout.takeAt(0)
        widget = item.widget()
        child_layout = item.layout()
        if widget:
            widget.deleteLater()
        if child_layout:
            clear_layout(child_layout)
