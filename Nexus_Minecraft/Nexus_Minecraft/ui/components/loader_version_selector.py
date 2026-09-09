from PySide6.QtCore import QThread, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QLabel, QComboBox


class _FetchLoaderVersionsWorker(QThread):
    finished_with_result = Signal(str, str, list, str)

    def __init__(self, loader_id: str, minecraft_version: str):
        super().__init__()
        self.loader_id = loader_id
        self.minecraft_version = minecraft_version

    def run(self):
        from core.loader_manager import get_loader_manager

        manager = get_loader_manager()
        loader_id = self.loader_id
        mc_version = self.minecraft_version

        try:
            known = manager.get_known_unsupported_message(
                loader_id=loader_id,
                minecraft_version=mc_version,
            )
            if known:
                self.finished_with_result.emit(loader_id, mc_version, [], known)
                return

            if loader_id != "vanilla" and not manager.is_minecraft_supported_by_loader(
                loader_id, mc_version
            ):
                label = manager.get_loader_label(loader_id)
                self.finished_with_result.emit(
                    loader_id,
                    mc_version,
                    [],
                    f"{label} не поддерживает Minecraft {mc_version}.",
                )
                return

            versions = manager.fetch_loader_versions(loader_id, mc_version)
            if loader_id != "vanilla" and not versions:
                label = manager.get_loader_label(loader_id)
                self.finished_with_result.emit(
                    loader_id,
                    mc_version,
                    [],
                    f"Не удалось получить версии {label} для {mc_version}. Проверь интернет.",
                )
                return

            self.finished_with_result.emit(loader_id, mc_version, versions, "")
        except Exception as error:
            self.finished_with_result.emit(loader_id, mc_version, [], str(error))


class LoaderVersionSelector(QWidget):
    compatibility_changed = Signal(bool, str)

    def __init__(self, parent=None):
        super().__init__(parent)

        self._worker = None
        self._pending_loader = ""
        self._pending_mc = ""
        self._compatible = True
        self._saved_loader_version = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        self.loader_version_combo = QComboBox()
        self.loader_version_combo.setToolTip("Версия mod loader для выбранной сборки Minecraft.")

        self.status_label = QLabel("")
        self.status_label.setObjectName("MutedText")
        self.status_label.setWordWrap(True)
        self.status_label.setVisible(False)

        layout.addWidget(self.loader_version_combo)
        layout.addWidget(self.status_label)

    def set_saved_loader_version(self, version: str | None):
        self._saved_loader_version = (version or "").strip() or None

    def attach(self, loader_combo: QComboBox, minecraft_combo: QComboBox):
        self._loader_combo = loader_combo
        self._minecraft_combo = minecraft_combo
        loader_combo.currentTextChanged.connect(
            lambda _text="": self._start_fetch(
                loader_combo.currentText().strip().lower(),
                minecraft_combo.currentText().strip(),
            )
        )
        minecraft_combo.currentTextChanged.connect(
            lambda _text="": self._start_fetch(
                loader_combo.currentText().strip().lower(),
                minecraft_combo.currentText().strip(),
            )
        )
        self._start_fetch(
            loader_combo.currentText().strip().lower(),
            minecraft_combo.currentText().strip(),
        )

    def _start_fetch(self, loader_id: str, mc_version: str):
        self._pending_loader = loader_id
        self._pending_mc = mc_version

        if loader_id == "vanilla" or not mc_version:
            self._apply_vanilla_state()
            return

        self.loader_version_combo.setEnabled(False)
        self.loader_version_combo.clear()
        self.loader_version_combo.addItem("Загрузка...")
        self._set_status("Проверка совместимости...", ok=True)

        if self._worker and self._worker.isRunning():
            self._worker.requestInterruption()

        self._worker = _FetchLoaderVersionsWorker(loader_id, mc_version)
        self._worker.finished_with_result.connect(self._on_versions_loaded)
        self._worker.start()

    def _apply_vanilla_state(self):
        self.loader_version_combo.clear()
        self.loader_version_combo.addItem("—")
        self.loader_version_combo.setEnabled(False)
        self._set_status("", ok=True)
        self.status_label.setVisible(False)
        self._compatible = True
        self.compatibility_changed.emit(True, "")

    def _on_versions_loaded(self, loader_id, mc_version, versions, error):
        if loader_id != self._pending_loader or mc_version != self._pending_mc:
            return

        self.loader_version_combo.clear()

        if error:
            self.loader_version_combo.addItem("—")
            self.loader_version_combo.setEnabled(False)
            self._set_status(error, ok=False)
            return

        if not versions:
            self.loader_version_combo.addItem("—")
            self.loader_version_combo.setEnabled(False)
            self._set_status("Версии не найдены.", ok=False)
            return

        for version in versions:
            self.loader_version_combo.addItem(version)

        preferred = self._saved_loader_version
        if preferred:
            idx = self.loader_version_combo.findText(preferred)
            if idx >= 0:
                self.loader_version_combo.setCurrentIndex(idx)
            self._saved_loader_version = None

        self.loader_version_combo.setEnabled(True)
        label = loader_id.capitalize()
        self._set_status(f"Доступно версий {label}: {len(versions)}", ok=True)

    def _set_status(self, message: str, ok: bool):
        self._compatible = ok
        self.status_label.setText(message)
        self.status_label.setVisible(bool(message))
        if ok:
            self.status_label.setStyleSheet("color: #94a3b8; font-size: 11px;")
        else:
            self.status_label.setStyleSheet("color: #ef4444; font-size: 11px;")
        self.compatibility_changed.emit(ok, message)

    def is_compatible(self) -> bool:
        return self._compatible

    def get_loader_version(self) -> str | None:
        if not self.loader_version_combo.isEnabled():
            return None

        text = self.loader_version_combo.currentText().strip()
        if not text or text in {"—", "Загрузка..."}:
            return None
        return text
