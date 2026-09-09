import json
from pathlib import Path

from PySide6.QtGui import QIcon

from PySide6.QtCore import QTimer, QThread, Signal
from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QMessageBox,
    QProgressBar,
    QSizePolicy,
)

from core.constants import APP_VERSION
from storage.paths import DATA_DIR
from core.launcher_settings import get_launcher_settings
from ui.styles import THEME_OPTIONS, get_app_style
from ui.components.sidebar import Sidebar
from ui.components.topbar import Topbar
from ui.components.toast import Toast
from ui.pages.home_page import HomePage
from ui.pages.instances_page import InstancesPage
from ui.pages.instance_detail_page import InstanceDetailPage
from ui.pages.mods_page import ModsPage
from ui.pages.library_page import LibraryPage
from ui.pages.downloads_page import DownloadsPage
from ui.pages.accounts_page import AccountsPage
from ui.pages.logs_page import LogsPage
from ui.pages.settings_page import SettingsPage


COMPACT_SIDEBAR_WIDTH = 1180
COMPACT_TOPBAR_WIDTH = 1080


def should_use_compact_sidebar(window_width, user_collapsed=False):
    """Compact sidebar only when user chose to collapse it."""
    _ = window_width
    return bool(user_collapsed)


def should_use_compact_topbar(window_width):
    return int(window_width) < COMPACT_TOPBAR_WIDTH


class PageIndex:
    HOME = 0
    INSTANCES = 1
    MODS = 2
    LIBRARY = 3
    DOWNLOADS = 4
    ACCOUNTS = 5
    SETTINGS = 6
    LOGS = 7


class WindowUpdateWorker(QThread):
    check_done = Signal(object)
    download_progress = Signal(int, object)
    download_done = Signal(object, object)
    download_failed = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._downloading = False
        self._release = None
        self._path = None

    def run(self):
        try:
            from core.updater import fetch_latest_release
            release = fetch_latest_release(timeout=6)
            self._release = release
            if release and release.is_newer and release.preferred_asset:
                self._downloading = True
                from core.updater import download_asset, create_update_notes

                asset = release.preferred_asset

                def on_progress(downloaded, total, speed):
                    percent = int(downloaded / total * 100) if total else 0
                    self.download_progress.emit(percent, None)

                path = download_asset(asset, progress_callback=on_progress)
                notes = create_update_notes(release, path)
                self._path = path
                self.download_done.emit(path, notes)
            else:
                self.check_done.emit(release)
        except Exception as error:
            if self._downloading:
                self.download_failed.emit(str(error))
            else:
                self.check_done.emit(None)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        try:
            from core.windows_app_id import set_windows_app_id
            set_windows_app_id()
        except Exception:
            pass

        self.setWindowTitle("Nexus Launcher")
        try:
            icon_path = Path(__file__).resolve().parents[1] / "assets" / "nexus.ico"
            if icon_path.exists():
                self.setWindowIcon(QIcon(str(icon_path)))
        except Exception:
            pass
        self.setMinimumSize(980, 640)
        self.resize(1240, 760)

        self.last_play_instance = None

        self.page_meta = [
            ("Главная", "Краткий обзор и быстрый старт"),
            ("Сборки", "Создание, запуск и настройка сборок"),
            ("Каталог", "Моды, шейдеры, ресурспаки и модпаки"),
            ("Библиотека", "Установленный контент по сборкам"),
            ("Загрузки", "История загрузок и состояние задач"),
            ("Аккаунты", "Offline, Microsoft, Ely.by и скины"),
            ("Настройки", "Java, RAM, папки и параметры лаунчера"),
            ("Логи", "Логи лаунчера и Minecraft"),
        ]

        root = QWidget()
        self.setCentralWidget(root)

        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        self.sidebar = Sidebar()
        self.sidebar.page_changed.connect(self.change_page)
        self.sidebar.profile_clicked.connect(lambda: self.change_page(PageIndex.ACCOUNTS))

        if hasattr(self.sidebar, "set_disabled_pages"):
            self.sidebar.set_disabled_pages(set())

        self.content = QWidget()
        self.content.setObjectName("AppContent")
        self.content.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        content_layout = QVBoxLayout(self.content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)

        self.topbar = Topbar()
        self.topbar.search_submitted.connect(self.handle_search)
        self.topbar.play_clicked.connect(self.handle_quick_play)
        self.topbar.theme_clicked.connect(self.toggle_theme)
        self.sidebar.collapsed_changed.connect(self._on_sidebar_collapsed_changed)

        self.home_page = HomePage()
        self.home_page.navigate_requested.connect(self.change_page)
        self.home_page.create_instance_requested.connect(self.open_create_instance)

        self.instances_page = InstancesPage()
        self.instances_page.instance_details_requested.connect(self.open_instance_details)

        self.instance_detail_page = InstanceDetailPage()
        self.instance_detail_page.back_clicked.connect(lambda checked=False: self.change_page(PageIndex.INSTANCES))
        self.instance_detail_page.play_clicked.connect(self.instances_page.launch_instance)

        self.mods_page = ModsPage()
        self.library_page = LibraryPage()
        self.downloads_page = DownloadsPage()
        self.accounts_page = AccountsPage()
        self.accounts_page.account_changed.connect(lambda _account: self.sidebar.update_profile())
        self.settings_page = SettingsPage()
        self.logs_page = LogsPage()

        self.pages = QStackedWidget()
        self.pages.addWidget(self.home_page)
        self.pages.addWidget(self.instances_page)
        self.pages.addWidget(self.mods_page)
        self.pages.addWidget(self.library_page)
        self.pages.addWidget(self.downloads_page)
        self.pages.addWidget(self.accounts_page)
        self.pages.addWidget(self.settings_page)
        self.pages.addWidget(self.logs_page)
        self.pages.addWidget(self.instance_detail_page)

        self.status_bar = self.create_status_bar()

        content_layout.addWidget(self.topbar)
        content_layout.addWidget(self.pages)
        content_layout.addWidget(self.status_bar)

        root_layout.addWidget(self.sidebar)
        root_layout.addWidget(self.content)

        self.startup_update_worker = None
        self._pending_update_path = None
        self._update_release = None
        self._update_pending_restart = False
        self._installing_update = False

        self.update_bar = self.create_update_bar()
        self.update_bar.setVisible(False)

        initial_collapsed = should_use_compact_sidebar(
            self.width(),
            get_launcher_settings().is_sidebar_collapsed(),
        )
        if hasattr(self.sidebar, "set_compact"):
            self.sidebar.set_compact(initial_collapsed)
        if hasattr(self.topbar, "set_compact"):
            self.topbar.set_compact(should_use_compact_topbar(self.width()))

        self.change_page(0)
        self.apply_theme(self.current_theme())
        QTimer.singleShot(3000, self.check_updates_on_startup)




    def closeEvent(self, event):
        if self.startup_update_worker and self.startup_update_worker.isRunning():
            self.startup_update_worker.quit()
            self.startup_update_worker.wait(3000)

        try:
            from core.discord_presence import discord_presence
            discord_presence().close()
        except Exception:
            pass

        if self._installing_update and self._pending_update_path:
            try:
                from core.updater import start_installer_after_exit
                start_installer_after_exit(self._pending_update_path, silent=True)
            except Exception:
                pass

        super().closeEvent(event)

    def check_updates_on_startup(self):
        if self.startup_update_worker and self.startup_update_worker.isRunning():
            return

        self.status_label.setText("Проверка обновлений...")
        self.startup_update_worker = WindowUpdateWorker()
        self.startup_update_worker.check_done.connect(self._on_update_check_done)
        self.startup_update_worker.download_progress.connect(self._on_update_download_progress)
        self.startup_update_worker.download_done.connect(self._on_update_downloaded)
        self.startup_update_worker.download_failed.connect(self._on_update_download_failed)
        self.startup_update_worker.start()

    def create_update_bar(self):
        bar = QWidget()
        bar.setObjectName("UpdateBar")
        bar.setFixedHeight(42)

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(16, 0, 16, 0)
        layout.setSpacing(10)

        self.update_status = QLabel()
        self.update_status.setObjectName("UpdateStatusText")

        self.update_progress = QProgressBar()
        self.update_progress.setObjectName("MiniProgress")
        self.update_progress.setFixedWidth(140)
        self.update_progress.setFixedHeight(6)
        self.update_progress.setVisible(False)
        self.update_progress.setValue(0)

        self.update_install_btn = QPushButton()
        self.update_install_btn.setObjectName("SmallGhostButton")
        self.update_install_btn.clicked.connect(self._do_update_install)
        self.update_install_btn.setFixedHeight(28)

        dismiss_btn = QPushButton("✕")
        dismiss_btn.setObjectName("SmallGhostButton")
        dismiss_btn.setFixedSize(28, 28)
        dismiss_btn.clicked.connect(self._dismiss_update)

        layout.addWidget(self.update_status, 1)
        layout.addWidget(self.update_progress)
        layout.addWidget(self.update_install_btn)
        layout.addWidget(dismiss_btn)

        content_layout = self.content.layout()
        content_layout.insertWidget(1, bar)
        return bar

    def _on_update_check_done(self, release):
        if release and getattr(release, "is_newer", False):
            self.status_label.setText(f"Готово • Доступно обновление {release.version}")
            self.update_progress.setVisible(True)
            self.update_status.setText(f"Nexus Launcher {release.version} — скачиваем...")
            self.update_install_btn.setEnabled(False)
            self.update_install_btn.setText("Скачивается...")
            self.update_bar.setVisible(True)
            self._update_release = release
        else:
            self.status_label.setText("Готово")

    def _on_update_download_progress(self, percent, _msg):
        self.update_progress.setValue(percent)
        self.update_status.setText(f"Скачивание обновления... {percent}%")

    def _on_update_downloaded(self, path, _notes):
        self.update_status.setText("Обновление готово к установке!")
        self.update_progress.setValue(100)
        self._pending_update_path = path
        self._update_pending_restart = True

        self.update_install_btn.setText("Перезапустить и установить")
        self.update_install_btn.setEnabled(True)
        self.update_bar.setObjectName("UpdateBarReady")
        self.update_bar.style().unpolish(self.update_bar)
        self.update_bar.style().polish(self.update_bar)
        self.status_label.setText("Готово • Обновление скачано")

    def _on_update_download_failed(self, error_text):
        self.update_bar.setVisible(False)
        self.status_label.setText("Готово")

    def _do_update_install(self):
        try:
            from core.discord_presence import discord_presence
            discord_presence().close()
        except Exception:
            pass

        if self._pending_update_path:
            self._installing_update = True
            self.close()
        elif self._update_release:
            self._on_update_check_done(self._update_release)

    def _dismiss_update(self):
        self.update_bar.setVisible(False)
        self._update_release = None
        self._pending_update_path = None
        self._update_pending_restart = False
        self._installing_update = False

    def resizeEvent(self, event):
        super().resizeEvent(event)
        sidebar_compact = should_use_compact_sidebar(
            self.width(),
            get_launcher_settings().is_sidebar_collapsed(),
        )
        if hasattr(self.sidebar, "set_compact"):
            self.sidebar.set_compact(sidebar_compact)
        if hasattr(self.topbar, "set_compact"):
            self.topbar.set_compact(should_use_compact_topbar(self.width()))

    def current_theme(self):
        try:
            settings_file = DATA_DIR / "launcher_settings.json"
            if settings_file.exists():
                data = json.loads(settings_file.read_text(encoding="utf-8"))
                theme = str(data.get("theme", "dark")).lower()
                valid = {theme_id for theme_id, _label in THEME_OPTIONS}
                return theme if theme in valid else "dark"
        except Exception:
            pass
        return "dark"

    def save_theme(self, theme):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            settings_file = DATA_DIR / "launcher_settings.json"
            data = {}
            if settings_file.exists():
                data = json.loads(settings_file.read_text(encoding="utf-8"))
            data["theme"] = theme
            tmp = settings_file.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(settings_file)
        except Exception:
            pass

    def toggle_theme(self):
        current = self.current_theme().lower()
        if current == "light":
            current = "dark"
        theme_ids = [theme_id for theme_id, _label in THEME_OPTIONS]
        try:
            next_theme = theme_ids[(theme_ids.index(current) + 1) % len(theme_ids)]
        except ValueError:
            next_theme = "dark"
        self.save_theme(next_theme)
        self.apply_theme(next_theme)
        if hasattr(self.settings_page, "sync_settings_combos"):
            self.settings_page.sync_settings_combos()

    def _on_sidebar_collapsed_changed(self, collapsed: bool):
        get_launcher_settings().set_sidebar_collapsed(bool(collapsed))
        if hasattr(self, "content") and self.content is not None:
            self.content.updateGeometry()
        self.updateGeometry()

    def toggle_sidebar(self):
        collapsed = not bool(getattr(self.sidebar, "compact", False))
        if hasattr(self.sidebar, "set_compact"):
            self.sidebar.set_compact(collapsed)
        get_launcher_settings().set_sidebar_collapsed(collapsed)

    def apply_theme(self, theme=None):
        theme = theme or self.current_theme()
        if str(theme).lower() == "light":
            theme = "dark"
            self.save_theme(theme)
        self.setStyleSheet(get_app_style(theme))
        if hasattr(self.topbar, "set_theme"):
            self.topbar.set_theme(theme)
        if hasattr(self.sidebar, "refresh_theme"):
            self.sidebar.refresh_theme(theme)
        if hasattr(self.sidebar, "update_profile"):
            self.sidebar.update_profile()

    def change_page(self, index):
        if index == PageIndex.HOME and hasattr(self.home_page, "refresh"):
            self.home_page.refresh()

        if index == PageIndex.MODS and hasattr(self.mods_page, "load_instances"):
            self.mods_page.load_instances()

        if index == PageIndex.LIBRARY and hasattr(self.library_page, "refresh"):
            self.library_page.refresh()

        if index == PageIndex.DOWNLOADS and hasattr(self.downloads_page, "refresh"):
            self.downloads_page.refresh()

        if index == PageIndex.ACCOUNTS and hasattr(self.accounts_page, "refresh"):
            self.accounts_page.refresh()
            if hasattr(self.sidebar, "update_profile"):
                self.sidebar.update_profile()

        if index == PageIndex.SETTINGS and hasattr(self.settings_page, "refresh"):
            self.settings_page.refresh()

        if index == PageIndex.LOGS and hasattr(self.logs_page, "refresh"):
            self.logs_page.refresh()

        self.pages.setCurrentIndex(index)

        if index < len(self.page_meta):
            title, subtitle = self.page_meta[index]
            self.topbar.set_page(title, subtitle)
            self.status_label.setText(f"Готово • {title}")
            self.sidebar.set_active(index)

            try:
                from core.discord_presence import discord_presence
                if index == PageIndex.MODS:
                    discord_presence().set_browsing_mods()
                else:
                    discord_presence().set_launcher_idle(title)
            except Exception:
                pass

    def open_create_instance(self):
        self.change_page(PageIndex.INSTANCES)
        self.instances_page.open_create_dialog()

    def handle_search(self, query):
        query = query.strip().lower()

        if not query:
            return

        instances = self.instances_page.instance_manager.get_instances()
        matches = [
            item for item in instances
            if query in item.get("name", "").lower()
        ]

        if matches:
            self.change_page(PageIndex.INSTANCES)
            if hasattr(self.instances_page, "search_input"):
                self.instances_page.search_input.setText(query)
                self.instances_page.refresh_instances()
            return

        self.change_page(PageIndex.MODS)

        if hasattr(self.mods_page, "query_input"):
            self.mods_page.query_input.setText(query)

        if hasattr(self.mods_page, "search_clicked"):
            self.mods_page.search_clicked()

    def handle_quick_play(self):
        instances = self.instances_page.instance_manager.get_instances()

        if not instances:
            QMessageBox.information(
                self,
                "Нет сборок",
                "Сначала создай сборку на вкладке «Сборки».",
            )
            self.change_page(PageIndex.INSTANCES)
            return

        latest = max(
            instances,
            key=lambda item: item.get("last_played_at") or item.get("created_at") or "",
        )
        self.instances_page.launch_instance(latest)

    def open_instance_details(self, instance):
        try:
            instance = instance or {}
            self.last_play_instance = instance
            self.instance_detail_page.set_instance(instance)

            detail_index = self.pages.indexOf(self.instance_detail_page)
            if detail_index >= 0:
                self.pages.setCurrentIndex(detail_index)
            else:
                self.pages.setCurrentWidget(self.instance_detail_page)

            self.topbar.set_page(
                instance.get("name", "Сборка"),
                f'Minecraft {instance.get("minecraft_version", "unknown")} • {instance.get("loader", "vanilla").capitalize()}'
            )

            self.status_label.setText(f'Открыта сборка • {instance.get("name", "Сборка")}')
            self.sidebar.set_active(PageIndex.INSTANCES)
        except Exception as error:
            QMessageBox.critical(
                self,
                "Ошибка страницы сборки",
                f"Не удалось открыть подробности сборки.\n\n{error}",
            )
            self.change_page(PageIndex.INSTANCES)

    def show_toast(self, title, text):
        toast = Toast(self, title, text)
        toast.show_toast()

    def placeholder_page(self, title_text, description_text):
        page = QWidget()

        layout = QVBoxLayout(page)
        layout.setContentsMargins(36, 32, 36, 32)
        layout.setSpacing(14)

        title = QLabel(title_text)
        title.setObjectName("PageTitle")

        description = QLabel(description_text)
        description.setObjectName("PageDescription")
        description.setWordWrap(True)

        layout.addWidget(title)
        layout.addWidget(description)
        layout.addStretch()

        return page

    def create_status_bar(self):
        bar = QWidget()
        bar.setObjectName("BottomStatusBar")
        bar.setFixedHeight(34)

        layout = QHBoxLayout(bar)
        layout.setContentsMargins(18, 0, 18, 0)
        layout.setSpacing(10)

        self.status_label = QLabel("Готово")
        self.status_label.setObjectName("BottomStatusText")

        version = QLabel(f"Nexus Launcher {APP_VERSION}")
        version.setObjectName("BottomStatusText")

        layout.addWidget(self.status_label)
        layout.addStretch()
        layout.addWidget(version)

        return bar
