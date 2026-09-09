import os
import shutil
import webbrowser
from pathlib import Path

from PySide6.QtCore import Signal, Qt, QThread
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QTabWidget,
    QScrollArea,
    QMessageBox,
    QLineEdit,
    QComboBox,
    QSpinBox,
    QTextEdit,
)

from mods.mod_installer import ModInstaller
from storage.json_store import load_json
from ui.utils.helpers import clear_layout


class _ModUpdateCheckWorker(QThread):
    results_ready = Signal(list, bool)
    failed = Signal(str)

    def __init__(self, instance, records):
        super().__init__()
        self.instance = instance
        self.records = records

    def run(self):
        try:
            results = []
            has_updates = False
            changed = False
            index_path = Path(self.instance["path"]) / "mods_index.json"
            index_data = load_json(index_path, {"mods": []})
            records = index_data.get("mods", [])

            for mod in records:
                project_id = mod.get("project_id") or mod.get("slug")
                version_id = mod.get("version_id")
                if not project_id:
                    continue

                try:
                    from mods.modrinth_api import ModrinthAPI
                    from mods.mod_installer import ModInstaller

                    api = ModrinthAPI()
                    project_type = mod.get("project_type", "mod")
                    loader = self.instance.get("loader", "fabric") if project_type in {"mod", "modpack"} else None

                    versions = api.get_project_versions(
                        project_id_or_slug=project_id,
                        minecraft_version=self.instance.get("minecraft_version", "1.20.1"),
                        loader=loader,
                    )

                    latest = ModInstaller().pick_best_version(versions) if versions else None
                    if latest and latest.get("id") != version_id:
                        mod["has_update"] = True
                        mod["latest_version_id"] = latest.get("id")
                        mod["latest_version_number"] = latest.get("version_number")
                        mod["latest_date_published"] = latest.get("date_published")
                        has_updates = True
                        changed = True
                        results.append(
                            f'{mod.get("title", "?")}: '
                            f'v{mod.get("version_number", "?")} → v{latest.get("version_number", "?")}'
                        )
                    else:
                        if mod.get("has_update"):
                            changed = True
                        mod["has_update"] = False
                        mod.pop("latest_version_id", None)
                        mod.pop("latest_version_number", None)
                        mod.pop("latest_date_published", None)
                except Exception:
                    mod["has_update"] = False

            if changed:
                from storage.json_store import save_json
                save_json(index_path, index_data)

            self.results_ready.emit(results, has_updates)
        except Exception as e:
            self.failed.emit(str(e))


class _ModAllUpdateWorker(QThread):
    progress = Signal(str)
    finished = Signal(list, list, list)
    failed = Signal(str)

    def __init__(self, instance, records):
        super().__init__()
        self.instance = instance
        self.records = records

    def run(self):
        try:
            updated = []
            skipped = []
            failed = []
            installer = ModInstaller()

            for record in self.records:
                try:
                    before = record.get("version_id")
                    result_data = installer.update_project(record, self.instance)
                    after = None
                    if isinstance(result_data, dict):
                        rec = result_data.get("record") or {}
                        after = rec.get("version_id")
                    if after and before and after != before:
                        updated.append(record.get("title") or record.get("slug") or "project")
                    else:
                        skipped.append(record.get("title") or record.get("slug") or "project")
                except Exception as error:
                    failed.append(f'{record.get("title") or record.get("slug") or "project"}: {error}')

            self.finished.emit(updated, skipped, failed)
        except Exception as e:
            self.failed.emit(str(e))


class InstanceDetailPage(QWidget):
    back_clicked = Signal()
    play_clicked = Signal(dict)

    def __init__(self):
        super().__init__()

        self.instance = None

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setObjectName("ScrollArea")

        self.content = QWidget()
        self.content_layout = QVBoxLayout(self.content)
        self.content_layout.setContentsMargins(36, 32, 36, 32)
        self.content_layout.setSpacing(18)

        self.scroll.setWidget(self.content)

        root.addWidget(self.scroll)

    def set_instance(self, instance):
        self.instance = instance or {}
        self.refresh()

    def clear(self):
        clear_layout(self.content_layout)

    def refresh(self):
        self.clear()

        if not self.instance:
            empty = QLabel("Сборка не выбрана")
            empty.setObjectName("PageTitle")
            self.content_layout.addWidget(empty)
            return

        self.content_layout.addWidget(self.create_hero())
        self.content_layout.addWidget(self.create_tabs())
        self.content_layout.addStretch()

    def create_hero(self):
        hero = QFrame()
        hero.setObjectName("InstanceDetailHero")
        hero.setMinimumHeight(210)

        layout = QVBoxLayout(hero)
        layout.setContentsMargins(24, 22, 24, 22)
        layout.setSpacing(16)

        top = QHBoxLayout()

        back_button = QPushButton("← Назад")
        back_button.setObjectName("SecondaryButton")
        back_button.clicked.connect(self.back_clicked.emit)

        play_button = QPushButton("▶ Играть")
        play_button.setObjectName("PrimaryButton")
        play_button.clicked.connect(lambda checked=False: self.play_clicked.emit(self.instance))

        folder_button = QPushButton("Папка")
        folder_button.setObjectName("SecondaryButton")
        folder_button.clicked.connect(self.open_folder)

        top.addWidget(back_button)
        top.addStretch()
        top.addWidget(folder_button)
        top.addWidget(play_button)

        name = QLabel(self.instance.get("name", "Без названия"))
        name.setObjectName("PageTitle")

        meta = QLabel(
            f'Minecraft {self.instance.get("minecraft_version", "unknown")} • '
            f'{self.instance.get("loader", "vanilla").capitalize()} • '
            f'RAM: {self.get_ram_text()}'
        )
        meta.setObjectName("PageDescription")
        meta.setWordWrap(True)

        path = QLabel(str(self.get_instance_path()))
        path.setObjectName("InstanceMeta")
        path.setWordWrap(True)

        metrics = QHBoxLayout()
        metrics.setSpacing(12)

        metrics.addWidget(self.metric_card("Моды", str(self.count_mods())))
        metrics.addWidget(self.metric_card("Миры", str(self.count_worlds())))
        metrics.addWidget(self.metric_card("Размер", self.get_size_text()))
        metrics.addStretch()

        layout.addLayout(top)
        layout.addWidget(name)
        layout.addWidget(meta)
        layout.addWidget(path)
        layout.addLayout(metrics)

        return hero

    def metric_card(self, title, value):
        card = QFrame()
        card.setObjectName("SettingsStatCard")

        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(5)

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")

        value_label = QLabel(value)
        value_label.setObjectName("HeroStatValue")

        layout.addWidget(title_label)
        layout.addWidget(value_label)

        return card

    def create_tabs(self):
        tabs = QTabWidget()
        tabs.setObjectName("InstanceDetailTabs")

        self.add_tab_safe(tabs, self.create_overview_tab, "Обзор")
        self.add_tab_safe(tabs, self.create_mods_tab, "Моды")
        self.add_tab_safe(tabs, self.create_worlds_tab, "Миры")
        self.add_tab_safe(tabs, self.create_screenshots_tab, "Скриншоты")
        self.add_tab_safe(tabs, self.create_crash_tab, "Crash-репорты")
        self.add_tab_safe(tabs, self.create_servers_tab, "Сервера")
        self.add_tab_safe(tabs, self.create_logs_tab, "Логи")
        self.add_tab_safe(tabs, self.create_settings_tab, "Настройки")

        return tabs

    def add_tab_safe(self, tabs, factory, title):
        try:
            page = factory()
            tabs.addTab(page, title)
        except Exception as error:
            page, layout = self.make_tab()
            error_title = QLabel(f"Не удалось открыть вкладку: {title}")
            error_title.setObjectName("CardTitle")

            error_text = QLabel(str(error))
            error_text.setObjectName("DownloadError")
            error_text.setWordWrap(True)

            layout.addWidget(error_title)
            layout.addWidget(error_text)
            layout.addStretch()

            tabs.addTab(page, f"{title} ⚠")

    def make_tab(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(12)
        return page, layout

    def create_overview_tab(self):
        page, layout = self.make_tab()

        layout.addWidget(self.info_row("Название", self.instance.get("name", "—")))
        layout.addWidget(self.info_row("Версия Minecraft", self.instance.get("minecraft_version", "—")))
        layout.addWidget(self.info_row("Загрузчик", self.instance.get("loader", "vanilla")))
        layout.addWidget(self.info_row("RAM", self.get_ram_text()))
        layout.addWidget(self.info_row("Папка сборки", str(self.get_instance_path())))
        layout.addWidget(self.info_row("Папка Minecraft", str(self.get_minecraft_dir())))

        layout.addSpacing(12)

        try:
            from mods.compatibility_analyzer import CompatibilityAnalyzer
            analyzer = CompatibilityAnalyzer()
            result = analyzer.analyze(self.instance)
            score = result.get("score", 100)
            issues = result.get("issues", [])
            warnings = result.get("warnings", [])

            status = result.get("status", "Normal")
            status_colors = {
                "Excellent": "#22C55E",
                "Normal": "#3B82F6",
                "Risks": "#F59E0B",
                "Problematic": "#EF4444",
            }

            compat_row = QFrame()
            compat_row.setObjectName("DetailInfoRow")
            compat_layout = QHBoxLayout(compat_row)
            compat_layout.setContentsMargins(14, 12, 14, 12)
            compat_layout.setSpacing(12)

            compat_title = QLabel("Совместимость")
            compat_title.setObjectName("HeroStatTitle")
            compat_title.setMinimumWidth(180)

            compat_value = QLabel(f"[{score}/100] {status}")
            compat_value.setStyleSheet(f"color: {status_colors.get(status, '#888')}; font-weight: 600;")

            compat_layout.addWidget(compat_title)
            compat_layout.addWidget(compat_value, 1)
            layout.addWidget(compat_row)

            if issues:
                for issue in issues:
                    issue_label = QLabel(f"⚠ {issue}")
                    issue_label.setStyleSheet("color: #ef4444; font-size: 12px; padding-left: 14px;")
                    layout.addWidget(issue_label)

            if warnings:
                for warning in warnings:
                    warning_label = QLabel(f"⚡ {warning}")
                    warning_label.setStyleSheet("color: #f59e0b; font-size: 12px; padding-left: 14px;")
                    layout.addWidget(warning_label)

        except Exception:
            pass

        layout.addStretch()
        return page

    def create_mods_tab(self):
        page, layout = self.make_tab()

        mods_dir = self.get_mods_dir()
        mods_dir.mkdir(parents=True, exist_ok=True)

        index_path = self.get_instance_path() / "mods_index.json"
        index_data = load_json(index_path, {"mods": []})
        indexed_mods = index_data.get("mods", [])
        indexed_files = set()

        if indexed_mods:
            header_row = QHBoxLayout()
            header = QLabel("Установленные моды")
            header.setObjectName("PanelTitle")

            check_updates_btn = QPushButton("Проверить обновления")
            check_updates_btn.setObjectName("SecondaryButton")
            check_updates_btn.clicked.connect(lambda checked=False, mods=indexed_mods: self._check_mod_updates(mods))

            update_all_btn = QPushButton("Обновить всё")
            update_all_btn.setObjectName("PrimaryButton")
            update_all_btn.clicked.connect(lambda checked=False, mods=indexed_mods: self._update_all_mods(mods))

            header_row.addWidget(header)
            header_row.addStretch()
            header_row.addWidget(check_updates_btn)
            header_row.addWidget(update_all_btn)
            layout.addLayout(header_row)

            for mod in indexed_mods:
                card = self._installed_mod_row(mod)
                layout.addWidget(card)
                for f in mod.get("files", []):
                    indexed_files.add(Path(f))

            layout.addSpacing(14)

        orphaned = [
            p for p in sorted(mods_dir.glob("*.jar"))
            if p not in indexed_files
        ]

        if orphaned:
            header = QLabel("Другие файлы")
            header.setObjectName("PanelTitle")
            layout.addWidget(header)

            for jar in orphaned:
                row = QFrame()
                row.setObjectName("DetailInfoRow")

                row_layout = QHBoxLayout(row)
                row_layout.setContentsMargins(14, 12, 14, 12)
                row_layout.setSpacing(12)

                name = QLabel(jar.name)
                name.setObjectName("InstanceTitle")

                meta = QLabel(self.path_size_text(jar))
                meta.setObjectName("InstanceMeta")

                delete_button = QPushButton("Удалить")
                delete_button.setObjectName("DangerButton")
                delete_button.clicked.connect(lambda checked, p=jar: self._delete_mod_file(p))

                row_layout.addWidget(name, 1)
                row_layout.addWidget(meta)
                row_layout.addWidget(delete_button)

                layout.addWidget(row)

        if not indexed_mods and not orphaned:
            layout.addWidget(self.empty_label("Моды пока не установлены. Открой вкладку «Моды» и установи их через Modrinth."))

        layout.addStretch()
        return page

    def _installed_mod_row(self, mod):
        row = QFrame()
        row.setObjectName("DetailInfoRow")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        text_block = QVBoxLayout()
        text_block.setSpacing(2)

        title = QLabel(mod.get("title") or mod.get("slug") or "Мод")
        title.setObjectName("InstanceTitle")

        meta_parts = []
        if mod.get("version_number"):
            meta_parts.append(f'v{mod["version_number"]}')
        if mod.get("slug"):
            meta_parts.append(mod["slug"])
        if mod.get("project_type") and mod["project_type"] != "mod":
            meta_parts.append(mod["project_type"])
        if mod.get("has_update"):
            meta_parts.append("⬆ Есть обновление!")
        meta_text = " • ".join(meta_parts) if meta_parts else ""

        meta = QLabel(meta_text)
        meta.setObjectName("InstanceMeta")

        text_block.addWidget(title)
        text_block.addWidget(meta)

        open_button = QPushButton("Modrinth")
        open_button.setObjectName("SecondaryButton")
        slug = mod.get("slug")
        if slug:
            open_button.clicked.connect(
                lambda checked=False, m=mod: webbrowser.open(self.modrinth_url_for_record(m))
            )

        remove_button = QPushButton("Удалить")
        remove_button.setObjectName("DangerButton")
        remove_button.clicked.connect(lambda checked, m=mod: self._remove_installed_mod(m))

        layout.addLayout(text_block, 1)
        layout.addWidget(open_button)
        layout.addWidget(remove_button)

        return row

    def _remove_installed_mod(self, mod):
        result = QMessageBox.question(
            self,
            "Удалить мод?",
            f'Удалить мод «{mod.get("title") or mod.get("slug", "?")}»?\n'
            f'Файлы будут перемещены в корзину.'
        )
        if result != QMessageBox.Yes:
            return

        try:
            installer = ModInstaller()
            deleted_any = False

            for file_str in mod.get("files", []):
                path = Path(file_str)
                if installer.delete_mod_file(path):
                    deleted_any = True
                installer.remove_from_index(self.instance, path)

            if not deleted_any:
                for file_str in mod.get("files", []):
                    path = Path(file_str)
                    if path.exists():
                        path.unlink()
                        deleted_any = True
                    installer.remove_from_index(self.instance, path)

            self.refresh()
        except Exception as error:
            QMessageBox.critical(self, "Ошибка удаления", str(error))

    def _check_mod_updates(self, indexed_mods):
        if not indexed_mods:
            return

        self._mod_update_worker = _ModUpdateCheckWorker(self.instance, indexed_mods)
        self._mod_update_worker.results_ready.connect(self._on_mod_updates_checked)
        self._mod_update_worker.failed.connect(lambda e: QMessageBox.critical(self, "Ошибка проверки обновлений", e))
        self._mod_update_worker.finished.connect(self._mod_update_worker.deleteLater)
        self._mod_update_worker.start()

    def _on_mod_updates_checked(self, results, has_updates):
        if has_updates:
            msg = "Доступны обновления:\n\n" + "\n".join(results)
            QMessageBox.information(self, "Обновления найдены", msg)
        else:
            QMessageBox.information(self, "Всё актуально", "Все проекты обновлены до последней совместимой версии.")

        self.refresh()

    def _update_all_mods(self, indexed_mods):
        if not indexed_mods:
            return

        result = QMessageBox.question(
            self,
            "Обновить все проекты?",
            "Nexus проверит совместимые версии и обновит все установленные моды/ресурспаки/шейдеры.\n\n"
            "Перед массовым обновлением лучше сделать резервную копию сборки."
        )
        if result != QMessageBox.Yes:
            return

        self._mod_all_update_worker = _ModAllUpdateWorker(self.instance, indexed_mods)
        self._mod_all_update_worker.finished.connect(self._on_mod_all_updated)
        self._mod_all_update_worker.failed.connect(lambda e: QMessageBox.critical(self, "Ошибка обновления", e))
        self._mod_all_update_worker.finished.connect(self._mod_all_update_worker.deleteLater)
        self._mod_all_update_worker.start()

    def _on_mod_all_updated(self, updated, skipped, failed):
        message = (
            f"Обновлено: {len(updated)}\n"
            f"Уже актуально/пропущено: {len(skipped)}\n"
            f"Ошибок: {len(failed)}"
        )
        if failed:
            message += "\n\nОшибки:\n" + "\n".join(failed[:8])

        QMessageBox.information(self, "Обновление завершено", message)
        self.refresh()

    def modrinth_url_for_record(self, record):
        slug = record.get("slug") or record.get("project_id")
        if not slug:
            return "https://modrinth.com"

        project_type = record.get("project_type") or "mod"
        path_by_type = {
            "mod": "mod",
            "modpack": "modpack",
            "resourcepack": "resourcepack",
            "shader": "shader",
        }
        return f"https://modrinth.com/{path_by_type.get(project_type, 'mod')}/{slug}"

    def _delete_mod_file(self, path):
        result = QMessageBox.question(
            self,
            "Удалить файл?",
            f"Удалить:\n{path.name}?"
        )
        if result != QMessageBox.Yes:
            return

        try:
            installer = ModInstaller()
            installer.delete_mod_file(path)
            installer.remove_from_index(self.instance, path)
            self.refresh()
        except Exception as error:
            QMessageBox.critical(self, "Ошибка удаления", str(error))

    def create_worlds_tab(self):
        page, layout = self.make_tab()

        saves_dir = self.get_minecraft_dir() / "saves"
        saves_dir.mkdir(parents=True, exist_ok=True)

        worlds = [item for item in saves_dir.iterdir() if item.is_dir()]

        if not worlds:
            layout.addWidget(self.empty_label("Миров пока нет. После создания мира в Minecraft он появится здесь."))
            layout.addStretch()
            return page

        for world in sorted(worlds):
            layout.addWidget(self.file_row(world, allow_delete=False))

        layout.addStretch()
        return page

    def create_screenshots_tab(self):
        page, layout = self.make_tab()

        screenshots_dir = self.get_minecraft_dir() / "screenshots"
        screenshots_dir.mkdir(parents=True, exist_ok=True)

        images = sorted(
            [f for f in screenshots_dir.iterdir() if f.suffix.lower() in (".png", ".jpg", ".jpeg")],
            key=lambda p: p.stat().st_mtime if p.exists() else 0,
            reverse=True,
        )

        if not images:
            layout.addWidget(self.empty_label("Скриншотов пока нет. Нажми F2 в Minecraft для создания скриншота."))
            layout.addStretch()
            return page

        import math
        cols = 3
        grid = QVBoxLayout()
        grid.setSpacing(8)

        for i in range(0, len(images), cols):
            row_layout = QHBoxLayout()
            row_layout.setSpacing(8)
            for img in images[i:i + cols]:
                img_widget = QFrame()
                img_widget.setObjectName("MiniCard")
                img_layout = QVBoxLayout(img_widget)
                img_layout.setContentsMargins(8, 8, 8, 8)
                img_layout.setSpacing(4)

                name = QLabel(img.name)
                name.setStyleSheet("font-size: 11px; color: #ccc;")
                name.setWordWrap(True)

                size = QLabel(self.path_size_text(img))
                size.setStyleSheet("font-size: 10px; color: #888;")

                open_btn = QPushButton("Открыть")
                open_btn.setObjectName("SecondaryButton")
                open_btn.clicked.connect(lambda checked=False, p=img: self.open_path(p))

                delete_btn = QPushButton("×")
                delete_btn.setObjectName("DangerButton")
                delete_btn.setFixedWidth(32)
                delete_btn.clicked.connect(lambda checked=False, p=img: self._delete_screenshot(p))

                btn_row = QHBoxLayout()
                btn_row.addWidget(open_btn)
                btn_row.addWidget(delete_btn)

                img_layout.addWidget(name)
                img_layout.addWidget(size)
                img_layout.addLayout(btn_row)

                row_layout.addWidget(img_widget)
            grid.addLayout(row_layout)

        layout.addLayout(grid)
        layout.addStretch()
        return page

    def _delete_screenshot(self, path):
        result = QMessageBox.question(
            self, "Удалить скриншот?", f"Удалить {path.name}?"
        )
        if result == QMessageBox.Yes:
            path.unlink(missing_ok=True)
            self.refresh()

    def create_crash_tab(self):
        page, layout = self.make_tab()

        crash_dir = self.get_minecraft_dir() / "crash-reports"
        crash_dir.mkdir(parents=True, exist_ok=True)

        crashes = sorted(
            [f for f in crash_dir.iterdir() if f.is_file()],
            key=lambda p: p.stat().st_mtime if p.exists() else 0,
            reverse=True,
        )

        if not crashes:
            layout.addWidget(self.empty_label("Crash-репортов нет. Если Minecraft упадёт, отчёт появится здесь."))
            layout.addStretch()
            return page

        for crash_file in crashes[:10]:
            card = QFrame()
            card.setObjectName("DetailInfoRow")
            card_layout = QVBoxLayout(card)
            card_layout.setContentsMargins(14, 10, 14, 10)
            card_layout.setSpacing(4)

            title = QLabel(crash_file.name)
            title.setObjectName("InstanceTitle")

            try:
                content = crash_file.read_text(encoding="utf-8", errors="ignore")
                preview = "\n".join(content.split("\n")[:8])
            except Exception:
                preview = "(не удалось прочитать)"

            preview_label = QLabel(preview[:500])
            preview_label.setStyleSheet("color: #ff6b6b; font-size: 11px; font-family: monospace;")
            preview_label.setWordWrap(True)

            file_btn = QPushButton("Открыть файл")
            file_btn.setObjectName("SecondaryButton")
            file_btn.clicked.connect(lambda checked=False, p=crash_file: self.open_path(p))

            card_layout.addWidget(title)
            card_layout.addWidget(preview_label)
            card_layout.addWidget(file_btn)

            layout.addWidget(card)

        if len(crashes) > 10:
            layout.addWidget(QLabel(f"... и ещё {len(crashes) - 10} crash-репортов"))

        layout.addStretch()
        return page

    def create_servers_tab(self):
        page, layout = self.make_tab()

        servers_file = self.get_minecraft_dir() / "servers.dat"
        manual_path = self.get_minecraft_dir() / "servers.txt"
        servers = []

        if servers_file.exists():
            try:
                import struct
                data = servers_file.read_bytes()
                servers = self._parse_servers_dat(data)
            except Exception:
                pass

        if manual_path.exists():
            for line in manual_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split(":", 1)
                    servers.append({"name": parts[0], "ip": parts[1] if len(parts) > 1 else parts[0], "source": "manual"})

        if not servers:
            layout.addWidget(self.empty_label("Серверов пока нет. Добавь сервер вручную ниже."))
        else:
            header = QLabel(f"Сервера ({len(servers)})")
            header.setObjectName("PanelTitle")
            layout.addWidget(header)

            for s in servers:
                row = QFrame()
                row.setObjectName("DetailInfoRow")
                row_layout = QHBoxLayout(row)
                row_layout.setContentsMargins(14, 10, 14, 10)
                row_layout.setSpacing(12)

                info = QVBoxLayout()
                info.setSpacing(2)

                name = QLabel(s.get("name", s.get("ip", "?")))
                name.setObjectName("InstanceTitle")

                ip = QLabel(f'{s.get("ip", "?")}  •  {s.get("source", "servers.dat")}')
                ip.setStyleSheet("color: #888; font-size: 11px;")

                info.addWidget(name)
                info.addWidget(ip)

                row_layout.addLayout(info, 1)
                layout.addWidget(row)

        layout.addSpacing(12)

        add_section = QLabel("Добавить сервер вручную")
        add_section.setObjectName("PanelTitle")
        layout.addWidget(add_section)

        self.server_name_input = QLineEdit()
        self.server_name_input.setPlaceholderText("Название сервера (например: Hypixel)")

        self.server_ip_input = QLineEdit()
        self.server_ip_input.setPlaceholderText("IP:Порт (например: mc.hypixel.net:25565)")

        add_btn = QPushButton("Добавить сервер")
        add_btn.setObjectName("PrimaryButton")
        add_btn.clicked.connect(lambda checked=False, path=manual_path: self._add_server(path))

        layout.addWidget(self.server_name_input)
        layout.addWidget(self.server_ip_input)
        layout.addWidget(add_btn)

        if servers_file.exists():
            info = QLabel(
                "Сервера из servers.dat (читать).\n"
                "Новые сервера добавляются в servers.txt (рядом с servers.dat)."
            )
            info.setStyleSheet("color: #666; font-size: 11px;")
            layout.addWidget(info)

        layout.addStretch()
        return page

    def _parse_servers_dat(self, data):
        import struct
        servers = []
        offset = 0
        while offset < len(data) - 4:
            try:
                name_len = struct.unpack(">H", data[offset:offset + 2])[0]
                offset += 2
                if name_len > 65535 or offset + name_len > len(data):
                    break
                name = data[offset:offset + name_len].decode("utf-8", errors="replace")
                offset += name_len
                ip_len = struct.unpack(">H", data[offset:offset + 2])[0]
                offset += 2
                if ip_len > 65535 or offset + ip_len > len(data):
                    break
                ip = data[offset:offset + ip_len].decode("utf-8", errors="replace")
                offset += ip_len
                servers.append({"name": name, "ip": ip, "source": "servers.dat"})
            except Exception:
                break
        return servers

    def _add_server(self, manual_path):
        name = self.server_name_input.text().strip()
        ip = self.server_ip_input.text().strip()

        if not name or not ip:
            QMessageBox.warning(self, "Ошибка", "Введи название и IP сервера.")
            return

        lines = []
        if manual_path.exists():
            lines = manual_path.read_text(encoding="utf-8").splitlines()

        lines.append(f"{name}:{ip}")
        manual_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

        self.server_name_input.clear()
        self.server_ip_input.clear()
        self.refresh()
        QMessageBox.information(self, "Готово", f'Сервер "{name}" добавлен.')

    def create_logs_tab(self):
        page, layout = self.make_tab()

        logs_dir = self.get_minecraft_dir() / "logs"
        launcher_logs_dir = Path.cwd() / "data" / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        launcher_logs_dir.mkdir(parents=True, exist_ok=True)

        header = QLabel("Логи сборки")
        header.setObjectName("PanelTitle")

        desc = QLabel(
            "Здесь собраны Minecraft latest.log, crash-related логи и последние логи Nexus. "
            "Если сборка не запускается, эту вкладку удобно копировать для диагностики."
        )
        desc.setObjectName("PanelText")
        desc.setWordWrap(True)

        layout.addWidget(header)
        layout.addWidget(desc)

        quick_actions = QHBoxLayout()
        quick_actions.setSpacing(10)

        open_mc_logs = QPushButton("Папка Minecraft logs")
        open_mc_logs.setObjectName("SecondaryButton")
        open_mc_logs.clicked.connect(lambda checked=False, p=logs_dir: self.open_path(p))

        open_launcher_logs = QPushButton("Папка Nexus logs")
        open_launcher_logs.setObjectName("SecondaryButton")
        open_launcher_logs.clicked.connect(lambda checked=False, p=launcher_logs_dir: self.open_path(p))

        quick_actions.addWidget(open_mc_logs)
        quick_actions.addWidget(open_launcher_logs)
        quick_actions.addStretch()
        layout.addLayout(quick_actions)

        log_files = []

        minecraft_latest = logs_dir / "latest.log"
        if minecraft_latest.exists():
            log_files.append(("Minecraft latest.log", minecraft_latest))

        for candidate in sorted(logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True):
            if candidate != minecraft_latest:
                log_files.append((f"Minecraft: {candidate.name}", candidate))

        for candidate in sorted(launcher_logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)[:5]:
            log_files.append((f"Nexus: {candidate.name}", candidate))

        if not log_files:
            layout.addWidget(self.empty_label("Логов пока нет. Запусти сборку — после этого Minecraft создаст latest.log."))
            layout.addStretch()
            return page

        for title_text, file_path in log_files[:8]:
            card = QFrame()
            card.setObjectName("DetailInfoRow")

            card_layout = QVBoxLayout(card)
            card_layout.setContentsMargins(14, 12, 14, 12)
            card_layout.setSpacing(8)

            top = QHBoxLayout()
            title = QLabel(title_text)
            title.setObjectName("InstanceTitle")

            meta = QLabel(f"{file_path.name} • {self.file_size_text(file_path)}")
            meta.setObjectName("InstanceMeta")

            open_btn = QPushButton("Открыть файл")
            open_btn.setObjectName("SecondaryButton")
            open_btn.clicked.connect(lambda checked=False, p=file_path: self.open_path(p))

            top.addWidget(title)
            top.addStretch()
            top.addWidget(open_btn)

            viewer = QTextEdit()
            viewer.setObjectName("LogViewer")
            viewer.setReadOnly(True)
            viewer.setMinimumHeight(170)

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                lines = content.splitlines()
                tail = "\n".join(lines[-220:])
                viewer.setPlainText(tail or "(лог пуст)")
            except Exception as error:
                viewer.setPlainText(f"Не удалось прочитать лог:\n{error}")

            card_layout.addLayout(top)
            card_layout.addWidget(meta)
            card_layout.addWidget(viewer)

            layout.addWidget(card)

        layout.addStretch()
        return page

    def file_size_text(self, path):
        try:
            size = Path(path).stat().st_size
        except Exception:
            return "—"

        units = ["B", "KB", "MB", "GB"]
        value = float(size)

        for unit in units:
            if value < 1024 or unit == units[-1]:
                if unit == "B":
                    return f"{int(value)} {unit}"
                return f"{value:.1f} {unit}"
            value /= 1024

        return "—"

    def create_settings_tab(self):
        page, layout = self.make_tab()

        layout.addWidget(self.info_row("ID", self.instance.get("id", "—")))
        layout.addWidget(self.info_row("Создана", self.instance.get("created_at", "—")))
        layout.addWidget(self.info_row("Последний запуск", str(self.instance.get("last_played_at", "—"))))
        layout.addWidget(self.info_row("Путь", str(self.get_instance_path())))

        layout.addSpacing(16)

        edit_section = QLabel("Редактирование")
        edit_section.setObjectName("CardTitle")
        layout.addWidget(edit_section)

        name_row = QFrame()
        name_layout = QHBoxLayout(name_row)
        name_layout.setContentsMargins(0, 4, 0, 4)
        name_label = QLabel("Название")
        name_label.setMinimumWidth(120)
        self.name_edit = QLineEdit(self.instance.get("name", ""))
        name_layout.addWidget(name_label)
        name_layout.addWidget(self.name_edit, 1)
        layout.addWidget(name_row)

        version_row = QFrame()
        version_layout = QHBoxLayout(version_row)
        version_layout.setContentsMargins(0, 4, 0, 4)
        version_label = QLabel("Версия Minecraft")
        version_label.setMinimumWidth(120)
        self.version_combo = QComboBox()
        self.version_combo.setEditable(True)
        self._populate_versions()
        current_ver = self.instance.get("minecraft_version", "")
        idx = self.version_combo.findText(current_ver)
        if idx >= 0:
            self.version_combo.setCurrentIndex(idx)
        else:
            self.version_combo.setCurrentText(current_ver)
        version_layout.addWidget(version_label)
        version_layout.addWidget(self.version_combo, 1)
        layout.addWidget(version_row)

        loader_row = QFrame()
        loader_layout = QHBoxLayout(loader_row)
        loader_layout.setContentsMargins(0, 4, 0, 4)
        loader_label = QLabel("Loader")
        loader_label.setMinimumWidth(120)
        self.loader_combo = QComboBox()
        self.loader_combo.addItems(["vanilla", "fabric", "forge", "neoforge", "quilt"])
        current_loader = self.instance.get("loader", "vanilla")
        idx = self.loader_combo.findText(current_loader)
        if idx >= 0:
            self.loader_combo.setCurrentIndex(idx)
        loader_layout.addWidget(loader_label)
        loader_layout.addWidget(self.loader_combo, 1)
        layout.addWidget(loader_row)

        ram_row = QFrame()
        ram_layout = QHBoxLayout(ram_row)
        ram_layout.setContentsMargins(0, 4, 0, 4)
        ram_label = QLabel("RAM (MB)")
        ram_label.setMinimumWidth(120)
        self.ram_spin = QSpinBox()
        self.ram_spin.setRange(1024, 65536)
        self.ram_spin.setSingleStep(512)
        self.ram_spin.setValue(int(self.instance.get("ram_mb", 4096)))
        ram_layout.addWidget(ram_label)
        ram_layout.addWidget(self.ram_spin, 1)
        layout.addWidget(ram_row)

        layout.addSpacing(12)

        save_btn = QPushButton("Сохранить изменения")
        save_btn.setObjectName("PrimaryButton")
        save_btn.clicked.connect(self._save_settings)
        layout.addWidget(save_btn)

        layout.addStretch()
        return page

    def _populate_versions(self):
        try:
            from core.version_manager import VersionManager
            vm = VersionManager()
            versions = vm.get_release_versions()
            if versions:
                for v in versions:
                    self.version_combo.addItem(v)
                return
        except Exception:
            pass
        fallbacks = ["1.20.1", "1.20.4", "1.20.6", "1.21", "1.21.1", "1.19.2", "1.18.2", "1.16.5", "1.12.2"]
        self.version_combo.addItems(fallbacks)

    def _save_settings(self):
        from core.instance_manager import get_instance_manager
        manager = get_instance_manager()

        updates = {
            "name": self.name_edit.text().strip() or self.instance.get("name", "Minecraft"),
            "minecraft_version": self.version_combo.currentText().strip(),
            "loader": self.loader_combo.currentText().strip(),
            "ram_mb": self.ram_spin.value(),
        }

        try:
            manager.update_instance(self.instance["id"], updates)
            self.instance.update(updates)
            QMessageBox.information(self, "Готово", "Настройки сохранены.")
            self.refresh()
        except Exception as error:
            QMessageBox.critical(self, "Ошибка", str(error))

    def info_row(self, title, value):
        row = QFrame()
        row.setObjectName("DetailInfoRow")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")
        title_label.setMinimumWidth(180)

        value_label = QLabel(str(value))
        value_label.setObjectName("PanelText")
        value_label.setWordWrap(True)
        value_label.setTextInteractionFlags(Qt.TextSelectableByMouse)

        layout.addWidget(title_label)
        layout.addWidget(value_label, 1)

        return row

    def file_row(self, path, allow_delete=False):
        row = QFrame()
        row.setObjectName("DetailInfoRow")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        name = QLabel(path.name)
        name.setObjectName("InstanceTitle")

        meta = QLabel(self.path_size_text(path))
        meta.setObjectName("InstanceMeta")

        open_button = QPushButton("Открыть")
        open_button.setObjectName("SecondaryButton")
        open_button.clicked.connect(lambda checked=False, p=path: self.open_path(p))

        layout.addWidget(name, 1)
        layout.addWidget(meta)
        layout.addWidget(open_button)

        if allow_delete:
            delete_button = QPushButton("Удалить")
            delete_button.setObjectName("DangerButton")
            delete_button.clicked.connect(lambda checked=False, p=path: self.delete_path(p))
            layout.addWidget(delete_button)

        return row

    def empty_label(self, text):
        label = QLabel(text)
        label.setObjectName("PanelText")
        label.setAlignment(Qt.AlignCenter)
        label.setWordWrap(True)
        label.setMinimumHeight(140)
        return label

    def get_instance_path(self):
        return Path(self.instance.get("path") or self.instance.get("instance_dir") or "")

    def get_minecraft_dir(self):
        if self.instance.get("minecraft_dir"):
            return Path(self.instance["minecraft_dir"])

        return self.get_instance_path() / ".minecraft"

    def get_mods_dir(self):
        return self.get_minecraft_dir() / "mods"

    def get_ram_text(self):
        ram = self.instance.get("ram_mb") or self.instance.get("ram") or 4096

        try:
            ram = int(ram)
            if ram >= 1024:
                gb = ram / 1024
                if abs(gb - round(gb)) < 0.05:
                    return f"{int(round(gb))} GB"
                return f"{gb:.1f} GB"
        except Exception:
            pass

        return str(ram)

    def count_mods(self):
        index_path = self.get_instance_path() / "mods_index.json"
        index_data = load_json(index_path, {"mods": []})
        indexed = len(index_data.get("mods", []))

        if indexed > 0:
            return indexed

        mods_dir = self.get_mods_dir()
        if not mods_dir.exists():
            return 0
        return len(list(mods_dir.glob("*.jar")))

    def count_worlds(self):
        saves_dir = self.get_minecraft_dir() / "saves"

        if not saves_dir.exists():
            return 0

        return len([item for item in saves_dir.iterdir() if item.is_dir()])

    def get_size_text(self):
        path = self.get_instance_path()

        if not path.exists():
            return "0 MB"

        total = 0

        for file in path.rglob("*"):
            try:
                if file.is_file():
                    total += file.stat().st_size
            except Exception:
                pass

        mb = total / (1024 * 1024)

        if mb >= 1024:
            return f"{mb / 1024:.1f} GB"

        return f"{mb:.0f} MB"

    def path_size_text(self, path):
        try:
            if path.is_file():
                size = path.stat().st_size / (1024 * 1024)
                return f"{size:.1f} MB"

            if path.is_dir():
                count = sum(1 for _ in path.rglob("*"))
                return f"{count} файлов"
        except Exception:
            pass

        return ""

    def open_folder(self):
        self.open_path(self.get_instance_path())

    def open_path(self, path):
        path = Path(path)

        if not path.exists():
            QMessageBox.warning(self, "Не найдено", f"Путь не найден:\n{path}")
            return

        try:
            os.startfile(str(path))
        except Exception:
            webbrowser.open(path.as_uri())

    def delete_path(self, path):
        result = QMessageBox.question(
            self,
            "Удалить файл?",
            f"Удалить:\n{path.name}?"
        )

        if result != QMessageBox.Yes:
            return

        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()

            self.refresh()
        except Exception as error:
            QMessageBox.critical(self, "Ошибка удаления", str(error))
