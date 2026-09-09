import os
import traceback
from pathlib import Path

from PySide6.QtCore import Signal, QThread, Qt, QSize
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QLineEdit,
    QScrollArea,
    QMessageBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QComboBox,
    QProgressBar,
    QDialogButtonBox,
    QGridLayout,
    QSizePolicy,
)

try:
    from core.instance_manager import get_instance_manager
except Exception:
    from core.instance_manager import InstanceManager

    def get_instance_manager():
        return InstanceManager()

from core.launcher import Launcher
from core.download_manager import DownloadManager
from core.version_manager import VersionManager
from core.loader_manager import get_loader_manager
from ui.components.loader_version_selector import LoaderVersionSelector
from ui.utils.helpers import clear_layout, elide_text, make_badge_label
from storage.json_store import load_json

try:
    from ui.icon_utils import icon
except Exception:
    icon = None


def qicon(name):
    if not icon:
        return None
    try:
        return icon(name)
    except Exception:
        return None


class LaunchWorker(QThread):
    status = Signal(str)
    progress = Signal(int)
    maximum = Signal(int)
    finished_ok = Signal()
    failed = Signal(str, str)

    def __init__(self, instance):
        super().__init__()
        self.instance = instance
        self.download_manager = DownloadManager()
        self.download_task_id = None

    def _safe_download_update(self, method_name, *args, **kwargs):
        """Запись в downloads.json не должна ломать сам запуск Minecraft."""
        try:
            method = getattr(self.download_manager, method_name)
            return method(*args, **kwargs)
        except Exception:
            # Подробный traceback всё равно уйдёт в latest.log, но запуск не прервётся.
            traceback.print_exc()
            return None

    def run(self):
        try:
            instance_name = self.instance.get("name", "Minecraft")
            self.download_task_id = self._safe_download_update(
                "start_task",
                kind="minecraft",
                title=f"Запуск Minecraft: {instance_name}",
                subtitle=f'{self.instance.get("minecraft_version", "unknown")} • {self.instance.get("loader", "vanilla")}',
                total=100,
                metadata={
                    "instance_id": self.instance.get("id"),
                    "instance_name": instance_name,
                },
            )

            def emit_status(text):
                self._safe_download_update(self.download_manager.update_task.__name__, self.download_task_id, status=str(text))
                self.status.emit(str(text))

            def emit_progress(value):
                try:
                    progress = int(value or 0)
                except Exception:
                    progress = 0

                self._safe_download_update(self.download_manager.update_task.__name__, self.download_task_id, progress=progress)
                self.progress.emit(progress)

            def emit_maximum(value):
                self.maximum.emit(int(value or 0))

            launcher = Launcher(
                set_status=emit_status,
                set_progress=emit_progress,
                set_max=emit_maximum,
            )
            launcher.launch_instance(self.instance)

            self._safe_download_update("finish_task", self.download_task_id, status="Minecraft запущен")
            self.finished_ok.emit()

        except Exception as error:
            self._safe_download_update("fail_task", self.download_task_id, str(error), status="Ошибка запуска")
            self.failed.emit(str(error), traceback.format_exc())


class MinecraftLaunchProgressDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Запуск Minecraft")
        self.setMinimumSize(560, 150)
        self.setWindowModality(Qt.NonModal)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 14)
        layout.setSpacing(12)

        self.status_label = QLabel("Подготовка запуска...")
        self.status_label.setObjectName("PanelText")
        self.status_label.setWordWrap(True)
        self.status_label.setMinimumHeight(38)

        self.progress_bar = QProgressBar()
        self.progress_bar.setObjectName("BigProgress")
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setMinimumHeight(18)

        actions = QHBoxLayout()
        hide_button = QPushButton("Скрыть")
        hide_button.setObjectName("SecondaryButton")
        hide_button.clicked.connect(self.hide)

        actions.addStretch()
        actions.addWidget(hide_button)

        layout.addWidget(self.status_label)
        layout.addWidget(self.progress_bar)
        layout.addLayout(actions)

    def setLabelText(self, text):
        self.status_label.setText(str(text))

    def setRange(self, minimum, maximum):
        self.progress_bar.setRange(int(minimum), int(maximum))

    def setValue(self, value):
        self.progress_bar.setValue(int(value or 0))


INVALID_NAME_CHARS = set('\\/:*?"<>|')


class CreateInstanceDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setWindowTitle("Создать сборку")
        self.setMinimumWidth(460)

        layout = QVBoxLayout(self)
        layout.setSpacing(14)

        form = QFormLayout()
        form.setSpacing(12)

        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("Например: Survival 1.20.1")
        self.name_input.textChanged.connect(self._validate_name)

        self.name_error = QLabel()
        self.name_error.setStyleSheet("color: #ef4444; font-size: 12px;")
        self.name_error.setVisible(False)

        self.version_combo = QComboBox()
        self._populate_versions()

        self.loader_combo = QComboBox()
        self.loader_combo.addItems(["fabric", "vanilla", "forge", "neoforge", "quilt"])
        self.loader_combo.setToolTip("Для модов: fabric, forge, neoforge или quilt.")

        self.loader_version_selector = LoaderVersionSelector(self)
        self.loader_version_selector.attach(self.loader_combo, self.version_combo)
        self.loader_version_selector.compatibility_changed.connect(self._on_loader_compatibility_changed)

        form.addRow("Название:", self.name_input)
        form.addRow("", self.name_error)
        form.addRow("Версия:", self.version_combo)
        form.addRow("Loader:", self.loader_combo)
        form.addRow("Версия loader:", self.loader_version_selector)

        buttons = QHBoxLayout()

        cancel = QPushButton("Отмена")
        cancel.setObjectName("SecondaryButton")
        cancel.clicked.connect(self.reject)

        self.create_btn = QPushButton("Создать")
        self.create_btn.setObjectName("PrimaryButton")
        self.create_btn.clicked.connect(self._on_create)
        self.create_btn.setEnabled(False)

        buttons.addStretch()
        buttons.addWidget(cancel)
        buttons.addWidget(self.create_btn)

        layout.addLayout(form)
        layout.addLayout(buttons)

    def _on_loader_compatibility_changed(self, ok: bool, _message: str):
        if not self.name_error.isVisible() and self.name_input.text().strip():
            self.create_btn.setEnabled(ok)
        elif not ok:
            self.create_btn.setEnabled(False)

    def _validate_name(self):
        name = self.name_input.text().strip()
        errors = []

        if not name:
            errors.append("Имя не может быть пустым.")
        else:
            if any(c in INVALID_NAME_CHARS for c in name):
                errors.append("Имя содержит недопустимые символы (\\ / : * ? \" < > |).")

            if len(name) > 100:
                errors.append("Имя слишком длинное (макс. 100 символов).")

            instance_manager = get_instance_manager()
            existing_names = [inst.get("name", "").lower() for inst in instance_manager.get_instances()]
            if name.lower() in existing_names:
                errors.append("Сборка с таким именем уже существует.")

        if errors:
            self.name_error.setText(" • ".join(errors))
            self.name_error.setVisible(True)
            self.create_btn.setEnabled(False)
        else:
            self.name_error.setVisible(False)
            self.create_btn.setEnabled(self.loader_version_selector.is_compatible())

        return not errors

    def _on_create(self):
        if not self._validate_name():
            return

        loader = self.loader_combo.currentText().strip().lower()
        mc_version = self.version_combo.currentText().strip()
        loader_version = self.loader_version_selector.get_loader_version()

        error = get_loader_manager().validate_loader_selection(
            loader_id=loader,
            minecraft_version=mc_version,
            loader_version=loader_version,
        )
        if error:
            self.loader_version_selector.compatibility_changed.emit(False, error)
            return

        self.accept()

    def _populate_versions(self):
        try:
            vm = VersionManager()
            versions = vm.get_release_versions()
            if versions:
                for v in versions:
                    self.version_combo.addItem(v)
                for preferred in ["1.20.1", "1.21", "1.21.1", "1.20.4", "1.19.2"]:
                    idx = self.version_combo.findText(preferred)
                    if idx >= 0:
                        self.version_combo.setCurrentIndex(idx)
                        break
                return
        except Exception:
            pass
        fallbacks = ["1.20.1", "1.20.4", "1.20.6", "1.21", "1.21.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"]
        self.version_combo.addItems(fallbacks)

    def get_data(self):
        name = self.name_input.text().strip() or f"Minecraft {self.version_combo.currentText()}"
        loader = self.loader_combo.currentText().strip().lower()

        return {
            "name": name,
            "minecraft_version": self.version_combo.currentText(),
            "loader": loader,
            "loader_version": self.loader_version_selector.get_loader_version(),
        }


class InstancesPage(QWidget):
    instance_details_requested = Signal(dict)

    def __init__(self):
        super().__init__()

        self.instance_manager = get_instance_manager()
        self.last_launched = None
        self.launch_worker = None
        self.progress_dialog = None

        root = QVBoxLayout(self)
        root.setContentsMargins(36, 32, 36, 32)
        root.setSpacing(18)

        top = QHBoxLayout()

        title_block = QVBoxLayout()
        title_block.setSpacing(4)

        title = QLabel("Сборки")
        title.setObjectName("PageTitle")

        desc = QLabel("Создание, запуск, экспорт и контроль Minecraft-сборок.")
        desc.setObjectName("PageDescription")
        desc.setWordWrap(True)

        title_block.addWidget(title)
        title_block.addWidget(desc)

        create_button = QPushButton("+ Создать сборку")
        create_button.setObjectName("PrimaryButton")
        create_button.clicked.connect(self.open_create_dialog)

        import_button = QPushButton("Импорт")
        import_button.setObjectName("SecondaryButton")
        import_button.clicked.connect(self.import_instance)

        top.addLayout(title_block)
        top.addStretch()
        top.addWidget(import_button)
        top.addWidget(create_button)

        root.addLayout(top)

        stats = QHBoxLayout()
        stats.setSpacing(14)
        self.total_instances_card = self.create_stat_card("Сборки", "0", "всего")
        self.fabric_instances_card = self.create_stat_card("Модовые", "0", "с loader")
        self.mods_count_card = self.create_stat_card("Моды", "0", "установлено")
        self.last_instance_card = self.create_stat_card("Последняя", "—", "активность")
        for card in [
            self.total_instances_card,
            self.fabric_instances_card,
            self.mods_count_card,
            self.last_instance_card,
        ]:
            stats.addWidget(card)
        root.addLayout(stats)

        tools = QHBoxLayout()
        tools.setSpacing(12)

        self.search_input = QLineEdit()
        self.search_input.setObjectName("SearchInput")
        self.search_input.setPlaceholderText("Поиск сборки...")
        self.search_input.textChanged.connect(self.refresh_instances)

        self.loader_filter = QComboBox()
        self.loader_filter.addItems(["Все loader", "vanilla", "fabric", "forge", "neoforge", "quilt"])
        self.loader_filter.currentIndexChanged.connect(self.refresh_instances)

        tools.addWidget(self.search_input, 1)
        tools.addWidget(self.loader_filter)

        root.addLayout(tools)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.scroll.setObjectName("ScrollArea")

        self.container = QWidget()
        self.cards_layout = QVBoxLayout(self.container)
        self.cards_layout.setContentsMargins(8, 8, 8, 8)
        self.cards_layout.setSpacing(14)

        self.scroll.setWidget(self.container)
        root.addWidget(self.scroll)

        self.refresh_instances()

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
        card.desc_label = desc_label

        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(desc_label)

        return card

    def get_instances(self):
        try:
            if hasattr(self.instance_manager, "reload"):
                self.instance_manager.reload()

            return self.instance_manager.get_instances()
        except Exception:
            return []

    def count_instance_mods(self, instance):
        try:
            index_path = Path(instance.get("path", "")) / "mods_index.json"
            return len(load_json(index_path, {"mods": []}).get("mods", []))
        except Exception:
            return 0

    def update_stats(self, all_instances, filtered_instances):
        total = len(all_instances)
        modded = len([
            item for item in all_instances
            if (item.get("loader") or "vanilla").lower() != "vanilla"
        ])
        mods_count = sum(self.count_instance_mods(item) for item in all_instances)

        self.total_instances_card.value_label.setText(str(total))
        self.fabric_instances_card.value_label.setText(str(modded))
        self.mods_count_card.value_label.setText(str(mods_count))

        latest = None
        if all_instances:
            latest = max(
                all_instances,
                key=lambda item: item.get("last_played_at") or item.get("created_at") or "",
            )

        if latest:
            self.last_instance_card.value_label.setText(elide_text(latest.get("name", "—"), 22))
            loader_version = latest.get("loader_version")
            loader_text = latest.get("loader", "vanilla")
            if loader_version and loader_text != "vanilla":
                loader_text = f"{loader_text} {loader_version}"
            self.last_instance_card.desc_label.setText(
                f'{latest.get("minecraft_version", "unknown")} · {loader_text}'
            )
        else:
            self.last_instance_card.value_label.setText("—")
            self.last_instance_card.desc_label.setText("активность")

    def refresh_instances(self):
        clear_layout(self.cards_layout)

        query = self.search_input.text().strip().lower() if hasattr(self, "search_input") else ""
        loader_filter = self.loader_filter.currentText() if hasattr(self, "loader_filter") else "Все loader"

        all_instances = self.get_instances()
        instances = list(all_instances)

        if query:
            instances = [
                item for item in instances
                if query in item.get("name", "").lower()
                or query in item.get("minecraft_version", "").lower()
                or query in item.get("loader", "").lower()
            ]

        if loader_filter != "Все loader":
            instances = [
                item for item in instances
                if (item.get("loader") or "vanilla").lower() == loader_filter.lower()
            ]

        self.update_stats(all_instances, instances)

        if not instances:
            empty = QLabel("Сборки не найдены. Измени фильтр или создай новую сборку.")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(220)

            self.cards_layout.addWidget(empty)
            self.cards_layout.addStretch()
            return

        instances.sort(
            key=lambda item: item.get("last_played_at") or item.get("created_at") or "",
            reverse=True,
        )

        for instance in instances:
            self.cards_layout.addWidget(self.create_instance_card(instance))

        self.cards_layout.addStretch()

    def create_badge(self, text):
        return make_badge_label(text, "SmallBadge", max_len=20)

    def create_instance_card(self, instance):
        card = QFrame()
        card.setObjectName("InstanceCard")
        card.setMinimumHeight(158)
        card.setMaximumHeight(190)
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(14)

        top = QHBoxLayout()
        top.setSpacing(14)

        icon_box = QLabel("▣")
        icon_box.setObjectName("BlockIcon")
        icon_box.setFixedSize(58, 58)
        icon_box.setAlignment(Qt.AlignCenter)
        icon_obj = qicon("nexus")
        if icon_obj:
            icon_box.setPixmap(icon_obj.pixmap(QSize(36, 36)))

        name_block = QVBoxLayout()
        name_block.setSpacing(6)

        title = QLabel(instance.get("name", "Без названия"))
        title.setObjectName("InstanceTitle")

        ram = instance.get("ram_mb") or instance.get("ram") or 4096
        loader = instance.get("loader", "vanilla")
        loader_version = instance.get("loader_version")
        version = instance.get("minecraft_version", "unknown")
        mod_count = self.count_instance_mods(instance)

        loader_label = loader
        if loader_version and loader != "vanilla":
            loader_label = f"{loader} {loader_version}"

        meta = QLabel(f"{version} · {loader_label} · {ram} MB · {mod_count} мод.")
        meta.setObjectName("InstanceMeta")

        name_block.addWidget(title)
        name_block.addWidget(meta)

        top.addWidget(icon_box)
        top.addLayout(name_block)
        top.addStretch()

        actions = QHBoxLayout()
        actions.setSpacing(10)

        play = QPushButton("▶ Играть")
        play.setObjectName("PrimaryButton")
        play.clicked.connect(lambda checked=False, item=instance: self.launch_instance(item))

        details = QPushButton("Подробнее")
        details.setObjectName("SecondaryButton")
        details.clicked.connect(lambda checked=False, item=instance: self.instance_details_requested.emit(item))

        export = QPushButton("Экспорт")
        export.setObjectName("SecondaryButton")
        export.clicked.connect(lambda checked=False, item=instance: self.export_instance(item))

        folder = QPushButton("Папка")
        folder.setObjectName("SecondaryButton")
        folder.clicked.connect(lambda checked=False, item=instance: self.open_instance_folder(item))

        delete = QPushButton("Удалить")
        delete.setObjectName("DangerButton")
        delete.clicked.connect(lambda checked=False, item=instance: self.delete_instance(item))

        actions.addWidget(play, 2)
        actions.addWidget(details, 1)
        actions.addWidget(export, 1)
        actions.addWidget(folder, 1)
        actions.addStretch()
        actions.addWidget(delete, 1)

        layout.addLayout(top)
        layout.addLayout(actions)

        return card

    def open_create_dialog(self):
        dialog = CreateInstanceDialog(self)

        if dialog.exec() != QDialog.Accepted:
            return

        data = dialog.get_data()

        try:
            try:
                self.instance_manager.create_instance(
                    data["name"],
                    data["minecraft_version"],
                    data["loader"],
                    loader_version=data.get("loader_version"),
                )
            except TypeError:
                self.instance_manager.create_instance(data)

            self.refresh_instances()

        except Exception as error:
            QMessageBox.critical(self, "Ошибка создания", str(error))

    def launch_instance(self, instance):
        if self.launch_worker and self.launch_worker.isRunning():
            QMessageBox.information(self, "Запуск уже идёт", "Дождись завершения текущего запуска.")
            return

        self.last_launched = instance

        self.progress_dialog = MinecraftLaunchProgressDialog(self)
        self.progress_dialog.setValue(0)
        self.progress_dialog.show()

        self.launch_worker = LaunchWorker(instance)
        self.launch_worker.status.connect(self.on_launch_status)
        self.launch_worker.progress.connect(self.on_launch_progress)
        self.launch_worker.maximum.connect(self.on_launch_maximum)
        self.launch_worker.finished_ok.connect(self.on_launch_finished)
        self.launch_worker.failed.connect(self.on_launch_error)
        self.launch_worker.start()

    def on_launch_status(self, text):
        if self.progress_dialog:
            self.progress_dialog.setLabelText(str(text))

    def on_launch_maximum(self, value):
        if not self.progress_dialog:
            return

        value = int(value or 0)

        if value <= 0:
            self.progress_dialog.setRange(0, 0)
        else:
            self.progress_dialog.setRange(0, value)

    def on_launch_progress(self, value):
        if self.progress_dialog:
            self.progress_dialog.setValue(int(value or 0))

    def on_launch_finished(self):
        if self.progress_dialog:
            self.progress_dialog.setRange(0, 100)
            self.progress_dialog.setValue(100)
            self.progress_dialog.setLabelText("Minecraft запущен.")
            self.progress_dialog.close()
            self.progress_dialog = None

        self.refresh_instances()

    def on_launch_error(self, error_text, details):
        if self.progress_dialog:
            self.progress_dialog.close()
            self.progress_dialog = None

        box = QMessageBox(self)
        box.setIcon(QMessageBox.Critical)
        box.setWindowTitle("Ошибка запуска")
        box.setText("Не удалось выполнить действие.")
        box.setInformativeText(str(error_text))
        box.setDetailedText(str(details))
        box.exec()

    def open_instance_folder(self, instance):
        path = Path(instance.get("path") or instance.get("instance_dir") or "")

        if not path.exists():
            QMessageBox.warning(self, "Папка не найдена", str(path))
            return

        os.startfile(str(path))

    def delete_instance(self, instance):
        result = QMessageBox.question(
            self,
            "Удалить сборку?",
            f'Удалить сборку «{instance.get("name", "Без названия")}»?'
        )

        if result != QMessageBox.Yes:
            return

        try:
            if hasattr(self.instance_manager, "delete_instance"):
                self.instance_manager.delete_instance(instance.get("id"))
            else:
                path = Path(instance.get("path") or "")
                if path.exists():
                    import shutil
                    shutil.rmtree(path)

            self.refresh_instances()
        except Exception as error:
            QMessageBox.critical(self, "Ошибка удаления", str(error))

    def export_instance(self, instance):
        from datetime import datetime
        default_name = f"{instance.get('name', 'instance')}_{datetime.now().strftime('%Y%m%d')}.zip"
        path, _ = QFileDialog.getSaveFileName(
            self, "Экспорт сборки", default_name, "ZIP (*.zip)"
        )
        if not path:
            return
        try:
            self.instance_manager.export_instance(instance.get("id"), path)
            QMessageBox.information(self, "Готово", f"Сборка экспортирована:\n{path}")
        except Exception as error:
            QMessageBox.critical(self, "Ошибка экспорта", str(error))

    def import_instance(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Импорт сборки", "", "ZIP (*.zip)"
        )
        if not path:
            return
        try:
            instance = self.instance_manager.import_instance(path)
            self.refresh_instances()
            QMessageBox.information(
                self, "Готово",
                f'Сборка «{instance.get("name")}» импортирована.'
            )
        except Exception as error:
            QMessageBox.critical(self, "Ошибка импорта", str(error))
