
from PySide6.QtCore import Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QFrame
from ui.utils.image_loader import RemoteImageLabel
from ui.utils.helpers import make_badge_label, elide_text


def fmt(v):
    try:
        value = int(v)
        if value >= 1_000_000:
            return f"{value / 1_000_000:.1f}M".replace(".0M", "M")
        if value >= 1_000:
            return f"{value / 1_000:.1f}K".replace(".0K", "K")
        return str(value)
    except Exception:
        return "0"


class ModCard(QWidget):
    install_clicked = Signal(object)
    details_clicked = Signal(object)

    def __init__(self, project):
        super().__init__()
        self.project = project
        self.setObjectName("ModCard")
        self.setMinimumHeight(175)

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(10)

        head = QHBoxLayout()
        box = QFrame()
        box.setObjectName("ModIconBox")
        box.setFixedSize(58, 58)
        bl = QVBoxLayout(box)
        bl.setContentsMargins(0, 0, 0, 0)
        icon = RemoteImageLabel(58, 58, "◆")
        icon.set_remote_image(project.get("icon_url"))
        bl.addWidget(icon)

        tb = QVBoxLayout()
        title = QLabel(elide_text(project.get("title", "Без названия"), 42))
        title.setObjectName("InstanceTitle")
        title.setWordWrap(True)
        title.setToolTip(str(project.get("title", "")))
        author = QLabel("by " + elide_text(str(project.get("author", "unknown")), 28))
        author.setObjectName("InstanceMeta")
        tb.addWidget(title)
        tb.addWidget(author)
        head.addWidget(box)
        head.addLayout(tb)
        head.addStretch()

        desc = QLabel(project.get("description", "Описание отсутствует."))
        desc.setObjectName("PanelText")
        desc.setWordWrap(True)
        desc.setMaximumHeight(56)

        stats = QHBoxLayout()
        stats.addWidget(self.badge(f"{fmt(project.get('downloads', 0))} DL"))
        for category in (project.get("categories") or [])[:2]:
            stats.addWidget(self.badge(elide_text(str(category), 16)))
        stats.addStretch()

        buttons = QHBoxLayout()
        install = QPushButton("Установить")
        install.setObjectName("PrimaryButton")
        install.clicked.connect(lambda checked=False: self.install_clicked.emit(self.project))
        details = QPushButton("Подробнее")
        details.setObjectName("SecondaryButton")
        details.clicked.connect(lambda checked=False: self.details_clicked.emit(self.project))
        buttons.addWidget(install)
        buttons.addWidget(details)
        buttons.addStretch()

        root.addLayout(head)
        root.addWidget(desc)
        root.addLayout(stats)
        root.addStretch()
        root.addLayout(buttons)

    def badge(self, text):
        return make_badge_label(text, "InstanceBadge", max_len=18)
