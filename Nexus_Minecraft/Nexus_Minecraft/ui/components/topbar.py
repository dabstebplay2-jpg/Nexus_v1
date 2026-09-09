from PySide6.QtCore import Signal, Qt, QSize
from PySide6.QtWidgets import (
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QLineEdit,
)

try:
    from ui.icon_utils import icon
except Exception:
    icon = None


class Topbar(QWidget):
    search_submitted = Signal(str)
    play_clicked = Signal()
    theme_clicked = Signal()

    THEME_LABELS = {
        "dark": "Тёмная",
        "amoled": "AMOLED",
        "forest": "Лес",
        "ocean": "Океан",
        "purple": "Эндер",
        "sunset": "Закат",
    }

    def __init__(self):
        super().__init__()

        self.setObjectName("Topbar")
        self.setFixedHeight(60)
        self.compact = False
        self.current_theme = "dark"

        root = QHBoxLayout(self)
        root.setContentsMargins(16, 8, 16, 8)
        root.setSpacing(10)

        title_block = QVBoxLayout()
        title_block.setSpacing(1)

        self.title_label = QLabel("Главная")
        self.title_label.setObjectName("TopbarTitle")

        self.subtitle_label = QLabel("Центр управления Nexus Launcher")
        self.subtitle_label.setObjectName("TopbarSubtitle")

        title_block.addWidget(self.title_label)
        title_block.addWidget(self.subtitle_label)

        self.search_input = QLineEdit()
        self.search_input.setObjectName("TopbarSearch")
        self.search_input.setPlaceholderText("Поиск по сборкам и каталогу")
        self.search_input.setMinimumWidth(180)
        self.search_input.setMaximumWidth(330)

        try:
            self.search_input.addAction(icon("search"), QLineEdit.ActionPosition.LeadingPosition)
        except Exception:
            try:
                self.search_input.addAction(icon("search"), QLineEdit.LeadingPosition)
            except Exception:
                pass

        self.search_input.returnPressed.connect(self.submit_search)

        self.theme_button = QPushButton("Тёмная")
        self.theme_button.setObjectName("TopbarThemeButton")
        self.theme_button.setCursor(Qt.PointingHandCursor)
        self.theme_button.setToolTip("Переключить тему")
        self.theme_button.setMinimumWidth(88)
        self.theme_button.setFixedWidth(88)
        self.theme_button.clicked.connect(self.theme_clicked.emit)

        self.play_button = QPushButton("Играть")
        self.play_button.setObjectName("TopbarPlayButton")
        self.play_button.setCursor(Qt.PointingHandCursor)
        self.play_button.setMinimumWidth(96)
        try:
            if icon:
                self.play_button.setIcon(icon("play"))
        except Exception:
            pass
        self.play_button.setIconSize(QSize(18, 18))
        self.play_button.clicked.connect(self.play_clicked.emit)

        root.addLayout(title_block)
        root.addStretch()
        root.addWidget(self.search_input)
        root.addWidget(self.theme_button)
        root.addWidget(self.play_button)

    def refresh_theme(self, theme: str | None = None):
        try:
            from ui.icon_utils import icon as load_icon
            play_icon = load_icon("play")
            if play_icon:
                self.play_button.setIcon(play_icon)
                self.play_button.setIconSize(QSize(18, 18))
        except Exception:
            pass

    def submit_search(self):
        self.search_submitted.emit(self.search_input.text())

    def set_page(self, title, subtitle):
        self.title_label.setText(title)
        self.subtitle_label.setText(subtitle)

    def set_compact(self, compact: bool):
        compact = bool(compact)
        if self.compact == compact:
            return

        self.compact = compact
        self.setFixedHeight(54 if compact else 60)
        self.subtitle_label.setVisible(not compact)
        self.search_input.setMinimumWidth(120 if compact else 180)
        self.search_input.setMaximumWidth(220 if compact else 330)
        self.play_button.setText("▶" if compact else "Играть")
        self.set_theme(self.current_theme)

    def set_theme(self, theme: str | None):
        self.current_theme = str(theme or "dark").lower()
        full_text = self.THEME_LABELS.get(self.current_theme, self.THEME_LABELS["dark"])
        self.theme_button.setText(full_text)
        self.theme_button.setToolTip(f"Тема: {full_text}. Нажми для следующей темы")
