import logging
import traceback
import webbrowser
from pathlib import Path

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QGridLayout,
    QLabel,
    QPushButton,
    QFrame,
    QDialog,
    QMessageBox,
    QProgressDialog,
    QComboBox,
)

from core.instance_manager import get_instance_manager
from core.version_manager import VersionManager
from mods.mod_installer import ModInstallerWorker
from mods.smart_presets import SMART_PRESETS
from storage.json_store import load_json, save_json


logger = logging.getLogger(__name__)


class BatchModInstallWorker(QThread):
    status = Signal(str)
    progress = Signal(int)
    finished_ok = Signal()
    failed = Signal(str, str)

    def __init__(self, presets_mods, instance):
        super().__init__()
        self.mods = presets_mods
        self.instance = instance

    def run(self):
        total = len(self.mods)
        for i, mod_spec in enumerate(self.mods):
            slug = mod_spec.get("slug")
            name = mod_spec.get("name") or slug
            try:
                self.status.emit(f"({i + 1}/{total}) Установка: {name}")
                self.progress.emit(int((i / total) * 100))

                project = {
                    "project_id": slug,
                    "slug": slug,
                    "title": name,
                }

                worker = ModInstallerWorker(project, self.instance)
                worker.run()

            except Exception as e:
                logger.warning("Failed to install %s: %s", slug, e)

        self.progress.emit(100)
        self.finished_ok.emit()


class SmartBuilderDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Smart Builder — умный подбор модов")
        self.setMinimumSize(760, 620)
        self.resize(800, 680)

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 24, 24, 24)
        root.setSpacing(18)

        title = QLabel("Smart Builder")
        title.setObjectName("PageTitle")

        desc = QLabel(
            "Выбери пресет — Nexus создаст сборку с Fabric и установит все нужные моды.\n"
            "Каждый пресет подобран вручную для своей задачи."
        )
        desc.setObjectName("PageDescription")
        desc.setWordWrap(True)

        root.addWidget(title)
        root.addWidget(desc)

        self.presets = SMART_PRESETS
        grid = QGridLayout()
        grid.setSpacing(16)

        for i, preset in enumerate(self.presets):
            card = self._preset_card(preset)
            grid.addWidget(card, i // 2, i % 2)

        root.addLayout(grid)
        root.addStretch()

        close_button = QPushButton("Закрыть")
        close_button.setObjectName("PrimaryButton")
        close_button.clicked.connect(self.reject)

        button_row = QHBoxLayout()
        button_row.addStretch()
        button_row.addWidget(close_button)
        root.addLayout(button_row)

    def _preset_card(self, preset):
        card = QFrame()
        card.setObjectName("ModResultCard")
        card.setMinimumHeight(200)
        card.setCursor(Qt.PointingHandCursor)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(12)

        emoji_label = QLabel(preset.get("emoji", "◆"))
        emoji_label.setObjectName("PageTitle")
        emoji_label.setAlignment(Qt.AlignCenter)

        title = QLabel(preset.get("title", "Пресет"))
        title.setObjectName("InstanceTitle")
        title.setAlignment(Qt.AlignCenter)

        subtitle = QLabel(preset.get("subtitle", ""))
        subtitle.setObjectName("InstanceMeta")
        subtitle.setAlignment(Qt.AlignCenter)
        subtitle.setWordWrap(True)

        desc = QLabel(preset.get("description", ""))
        desc.setObjectName("PanelText")
        desc.setWordWrap(True)

        tags_row = QHBoxLayout()
        tags_row.setSpacing(6)
        tags_row.addStretch()
        for tag in preset.get("tags", [])[:3]:
            tag_label = QLabel(tag)
            tag_label.setObjectName("ModTag")
            tags_row.addWidget(tag_label)
        tags_row.addStretch()

        install_button = QPushButton(f"Создать и установить")
        install_button.setObjectName("PrimaryButton")
        install_button.clicked.connect(lambda checked, p=preset: self._apply_preset(p))

        layout.addWidget(emoji_label)
        layout.addWidget(title)
        layout.addWidget(subtitle)
        layout.addWidget(desc)
        layout.addLayout(tags_row)
        layout.addStretch()
        layout.addWidget(install_button)

        return card

    def _apply_preset(self, preset):
        preset_id = preset.get("id", "custom")
        preset_title = preset.get("title", "Сборка")
        mod_slugs = preset.get("mods", [])
        recommended_ram = preset.get("recommended_ram", 4096)

        if not mod_slugs:
            QMessageBox.information(self, "Пресет пуст", "В этом пресете нет модов для установки.")
            return

        version_dialog = _VersionPickDialog(preset_title, self)
        if version_dialog.exec() != QDialog.Accepted:
            return

        mc_version = version_dialog.selected_version()

        self.accept()

        parent_window = self.parent().window() if self.parent() else None

        instance_manager = get_instance_manager()
        try:
            instance = instance_manager.create_instance(
                name=preset_title,
                minecraft_version=mc_version,
                loader="fabric",
                ram_mb=recommended_ram,
            )
        except Exception as e:
            QMessageBox.critical(self, "Ошибка создания", str(e))
            return

        progress = QProgressDialog(
            f"Установка модов пресета «{preset_title}»...",
            "Скрыть",
            0,
            100,
            parent_window or self,
        )
        progress.setWindowTitle("Smart Builder")
        progress.setMinimumWidth(520)
        progress.setAutoClose(True)
        progress.setAutoReset(True)
        progress.setWindowModality(Qt.NonModal)
        progress.show()

        self._batch_worker = BatchModInstallWorker(mod_slugs, instance)
        self._batch_worker.status.connect(progress.setLabelText)
        self._batch_worker.progress.connect(progress.setValue)
        self._batch_worker.finished_ok.connect(lambda: self._on_batch_done(instance, preset))
        self._batch_worker.failed.connect(lambda e, d: progress.close())
        self._batch_worker.start()

    def _on_batch_done(self, instance, preset):
        QMessageBox.information(
            self,
            "Сборка готова",
            f'Сборка «{preset.get("title")}» создана!\n\n'
            f'Моды установлены. Можешь запускать Minecraft.'
        )


class _VersionPickDialog(QDialog):
    def __init__(self, preset_title, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"Версия для «{preset_title}»")
        self.setMinimumWidth(380)

        layout = QVBoxLayout(self)
        layout.setSpacing(14)

        label = QLabel("Выбери версию Minecraft для сборки:")
        label.setObjectName("PanelText")
        layout.addWidget(label)

        self.version_combo = QComboBox()

        try:
            vm = VersionManager()
            versions = vm.get_release_versions()
            for v in versions:
                self.version_combo.addItem(v)
            idx = self.version_combo.findText("1.20.1")
            if idx >= 0:
                self.version_combo.setCurrentIndex(idx)
        except Exception:
            fallbacks = ["1.20.1", "1.20.4", "1.20.6", "1.21", "1.21.1", "1.19.2", "1.18.2", "1.16.5"]
            for v in fallbacks:
                self.version_combo.addItem(v)

        layout.addWidget(self.version_combo)

        buttons = QHBoxLayout()
        cancel = QPushButton("Отмена")
        cancel.setObjectName("SecondaryButton")
        cancel.clicked.connect(self.reject)

        ok = QPushButton("Создать")
        ok.setObjectName("PrimaryButton")
        ok.clicked.connect(self.accept)

        buttons.addStretch()
        buttons.addWidget(cancel)
        buttons.addWidget(ok)
        layout.addLayout(buttons)

    def selected_version(self):
        return self.version_combo.currentText()
