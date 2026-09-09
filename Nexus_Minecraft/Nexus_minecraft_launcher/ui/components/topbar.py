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
    theme_toggle_clicked = Signal()

    def __init__(self):
        super().__init__()

        self.setObjectName("Topbar")
        self.setFixedHeight(72)
        self.compact = False

        root = QHBoxLayout(self)
        root.setContentsMargins(22, 10, 24, 10)
        root.setSpacing(12)

        title_block = QVBoxLayout()
        title_block.setSpacing(2)

        self.title_label = QLabel("Главная")
        self.title_label.setObjectName("TopbarTitle")

        self.subtitle_label = QLabel("Центр управления Nexus Launcher")
        self.subtitle_label.setObjectName("TopbarSubtitle")

        title_block.addWidget(self.title_label)
        title_block.addWidget(self.subtitle_label)

        self.search_input = QLineEdit()
        self.search_input.setObjectName("TopbarSearch")
        self.search_input.setPlaceholderText("Поиск сборок, модов, настроек...")
        self.search_input.setMinimumWidth(180)
        self.search_input.setMaximumWidth(390)

        try:
            self.search_input.addAction(icon("search"), QLineEdit.ActionPosition.LeadingPosition)
        except Exception:
            try:
                self.search_input.addAction(icon("search"), QLineEdit.LeadingPosition)
            except Exception:
                pass

        self.search_input.returnPressed.connect(self.submit_search)

        self.status_button = QPushButton("READY")
        self.status_button.setObjectName("TopbarStatusButton")
        self.status_button.setCursor(Qt.PointingHandCursor)
        try:
            if icon:
                self.status_button.setIcon(icon("rocket"))
            else:
                self.status_button.setText("🚀")
        except Exception:
            pass
        self.status_button.setIconSize(QSize(16, 16))


        self.theme_button = QPushButton("☾")
        self.theme_button.setObjectName("TopbarThemeButton")
        self.theme_button.setCursor(Qt.PointingHandCursor)
        self.theme_button.setToolTip("Сменить тему")
        self.theme_button.setFixedWidth(48)
        self.theme_button.clicked.connect(self.theme_toggle_clicked.emit)

        self.play_button = QPushButton("Играть")
        self.play_button.setObjectName("TopbarPlayButton")
        self.play_button.setCursor(Qt.PointingHandCursor)
        try:
            if icon:
                self.play_button.setIcon(icon("play"))
        except Exception:
            pass
        self.play_button.setIconSize(QSize(18, 18))
        self.play_button.clicked.connect(self.play_clicked.emit)

        root.addLayout(title_block)
        root.addStretch()
        root.addWidget(self.search_input, 1)
        root.addWidget(self.status_button)
        root.addWidget(self.theme_button)
        root.addWidget(self.play_button)

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
        self.setFixedHeight(56 if compact else 72)
        self.title_label.setVisible(not compact)
        self.subtitle_label.setVisible(False if compact else True)
        self.status_button.setVisible(not compact)
        self.search_input.setMinimumWidth(110 if compact else 180)
        self.search_input.setMaximumWidth(230 if compact else 390)
        self.theme_button.setFixedWidth(42 if compact else 48)
        self.play_button.setText("▶" if compact else "Играть")



    def set_theme(self, theme):
        theme = str(theme or "dark").lower()
        if theme == "light":
            self.theme_button.setText("☀")
            self.theme_button.setToolTip("Светлая тема активна. Нажми, чтобы включить тёмную.")
        elif theme == "amoled":
            self.theme_button.setText("●")
            self.theme_button.setToolTip("AMOLED активна. Нажми, чтобы включить светлую.")
        else:
            self.theme_button.setText("☾")
            self.theme_button.setToolTip("Тёмная тема активна. Нажми, чтобы включить светлую.")
