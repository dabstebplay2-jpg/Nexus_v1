import os
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QTextCursor
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QTextEdit,
    QPushButton,
    QLineEdit,
    QComboBox,
    QFrame,
    QApplication,
)

try:
    from core.logger import get_latest_log_path
except Exception:
    get_latest_log_path = lambda: Path("logs/latest.log")


class LogsPage(QWidget):
    def __init__(self):
        super().__init__()
        self.raw_text = ""

        self.root = QVBoxLayout(self)
        self.root.setContentsMargins(36, 32, 36, 32)
        self.root.setSpacing(18)

        self.build_ui()
        self.refresh()

    def build_ui(self):
        title_box = QVBoxLayout()
        title_box.setSpacing(4)

        title = QLabel("Логи")
        title.setObjectName("PageTitle")

        subtitle = QLabel("Просмотр логов лаунчера, Minecraft и crash-потока в одном месте.")
        subtitle.setObjectName("PageDescription")
        subtitle.setWordWrap(True)

        title_box.addWidget(title)
        title_box.addWidget(subtitle)

        actions = QHBoxLayout()
        actions.setSpacing(10)

        self.search_input = QLineEdit()
        self.search_input.setObjectName("SearchInput")
        self.search_input.setPlaceholderText("Поиск по логам...")
        self.search_input.textChanged.connect(self.apply_filters)

        self.level_combo = QComboBox()
        self.level_combo.addItems(["Все", "INFO", "WARNING", "ERROR", "DEBUG"])
        self.level_combo.currentIndexChanged.connect(self.apply_filters)

        refresh_btn = QPushButton("Обновить")
        refresh_btn.setObjectName("PrimaryButton")
        refresh_btn.clicked.connect(self.refresh)

        copy_btn = QPushButton("Скопировать")
        copy_btn.setObjectName("SecondaryButton")
        copy_btn.clicked.connect(self.copy_logs)

        folder_btn = QPushButton("Открыть папку")
        folder_btn.setObjectName("SecondaryButton")
        folder_btn.clicked.connect(self.open_logs_folder)

        actions.addWidget(self.search_input, 1)
        actions.addWidget(self.level_combo)
        actions.addWidget(copy_btn)
        actions.addWidget(folder_btn)
        actions.addWidget(refresh_btn)

        self.root.addLayout(title_box)
        self.root.addLayout(actions)

        stats = QHBoxLayout()
        stats.setSpacing(14)
        self.lines_card = self.create_stat_card("Строки", "0", "в текущем логе")
        self.info_card = self.create_stat_card("INFO", "0", "информационных")
        self.warn_card = self.create_stat_card("WARNING", "0", "предупреждений")
        self.error_card = self.create_stat_card("ERROR", "0", "ошибок")

        for card in [self.lines_card, self.info_card, self.warn_card, self.error_card]:
            stats.addWidget(card)
        self.root.addLayout(stats)

        self.path_label = QLabel("—")
        self.path_label.setObjectName("InstanceMeta")
        self.root.addWidget(self.path_label)

        self.text = QTextEdit()
        self.text.setReadOnly(True)
        self.text.setObjectName("LogViewer")
        self.root.addWidget(self.text, 1)

    def create_stat_card(self, title, value, desc):
        card = QFrame()
        card.setObjectName("DownloadSummaryCard")

        layout = QVBoxLayout(card)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(6)

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")
        value_label = QLabel(value)
        value_label.setObjectName("DownloadBigNumber")
        desc_label = QLabel(desc)
        desc_label.setObjectName("InstanceMeta")

        card.value_label = value_label
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(desc_label)
        return card

    def refresh(self):
        try:
            path = Path(get_latest_log_path())
        except Exception:
            path = Path("logs/latest.log")

        self.path_label.setText(f"Файл: {path}")

        try:
            self.raw_text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else "Лог пока пуст."
        except Exception as error:
            self.raw_text = str(error)

        self.update_stats()
        self.apply_filters()

    def update_stats(self):
        lines = self.raw_text.splitlines()
        upper_text = self.raw_text.upper()
        self.lines_card.value_label.setText(str(len(lines)))
        self.info_card.value_label.setText(str(upper_text.count("| INFO |") + upper_text.count(" INFO ")))
        self.warn_card.value_label.setText(str(upper_text.count("| WARNING |") + upper_text.count(" WARN ")))
        self.error_card.value_label.setText(str(upper_text.count("| ERROR |") + upper_text.count(" ERROR ")))

    def apply_filters(self):
        query = self.search_input.text().strip().lower()
        level = self.level_combo.currentText()

        lines = self.raw_text.splitlines()
        filtered = []

        for line in lines:
            line_lower = line.lower()
            if query and query not in line_lower:
                continue
            if level != "Все" and level.lower() not in line_lower:
                continue
            filtered.append(line)

        text = "\n".join(filtered) if filtered else "Ничего не найдено по текущему фильтру."
        self.text.setPlainText(text)
        cursor = self.text.textCursor()
        cursor.movePosition(QTextCursor.Start)
        self.text.setTextCursor(cursor)

    def copy_logs(self):
        QApplication.clipboard().setText(self.text.toPlainText())

    def open_logs_folder(self):
        try:
            path = Path(get_latest_log_path()).parent
            if hasattr(os, "startfile"):
                os.startfile(str(path))
        except Exception:
            pass
