import hashlib
import json
import re
import traceback
import webbrowser
from pathlib import Path

import requests
from PySide6.QtCore import Qt, QThread, Signal, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QGridLayout,
    QLabel,
    QPushButton,
    QFrame,
    QLineEdit,
    QComboBox,
    QScrollArea,
    QMessageBox,
    QProgressDialog,
    QDialog,
    QTextEdit,
    QFileDialog,
    QInputDialog,
    QSizePolicy,
)

try:
    from core.instance_manager import get_instance_manager
except Exception:
    from core.instance_manager import InstanceManager

    def get_instance_manager():
        return InstanceManager()

from core.launcher_settings import get_launcher_settings
from mods.mod_installer import ModInstallerWorker
from mods.mod_status import installed_state, cleanup_missing_records
from mods.shader_support import has_shader_loader, recommended_shader_loader, shader_status_text, shaderpacks_dir
from ui.pages.smart_builder_page import SmartBuilderDialog
from ui.utils.helpers import clear_layout
from ui.utils.image_loader import RemoteImageLabel

MODRINTH_API = "https://api.modrinth.com/v2"
from core.constants import USER_AGENT
from storage.paths import STORAGE_DIR

CACHE_DIR = STORAGE_DIR / "modrinth_cache" / "images"

PROJECT_TYPES = [
    {
        "label": "Моды",
        "value": "mod",
        "placeholder": "sodium, iris, jei...",
        "description": "Клиентские и серверные .jar-моды для Fabric/Forge/NeoForge/Quilt.",
        "installable": True,
    },
    {
        "label": "Модпаки",
        "value": "modpack",
        "placeholder": "fabulously optimized, better mc...",
        "description": "Готовые .mrpack-сборки. Nexus скачивает .mrpack, создаёт новую сборку и устанавливает моды.",
        "installable": True,
    },
    {
        "label": "Ресурспаки",
        "value": "resourcepack",
        "placeholder": "faithful, fresh animations...",
        "description": "Текстуры и визуальные resource packs. Устанавливаются в resourcepacks.",
        "installable": True,
    },
    {
        "label": "Шейдеры",
        "value": "shader",
        "placeholder": "complementary, bsl, sildur...",
        "description": "Shader packs. Nexus скачивает .zip в .minecraft/shaderpacks и подсказывает, если нужен Iris/Oculus/OptiFine.",
        "installable": True,
    },
]

TYPE_CATEGORY_PRESETS = {
    "mod": [
        ("Все категории", ""),
        ("Оптимизация", "optimization"),
        ("Библиотеки/API", "library"),
        ("Утилиты", "utility"),
        ("Геймплей", "game-mechanics"),
        ("Приключения", "adventure"),
        ("Мобы", "mobs"),
        ("Магия", "magic"),
        ("Технологии", "technology"),
        ("Мир/генерация", "worldgen"),
        ("Декор", "decoration"),
        ("Еда", "food"),
        ("Снаряжение", "equipment"),
        ("Транспорт", "transportation"),
    ],
    "modpack": [
        ("Все категории", ""),
        ("Оптимизация", "optimization"),
        ("Квесты", "quests"),
        ("Приключения", "adventure"),
        ("Магия", "magic"),
        ("Технологии", "technology"),
        ("Мультиплеер", "multiplayer"),
        ("Vanilla+", "vanilla-plus"),
        ("Хоррор", "horror"),
        ("Сложность", "challenging"),
    ],
    "resourcepack": [
        ("Все категории", ""),
        ("Vanilla-like", "vanilla-like"),
        ("Realistic", "realistic"),
        ("Simplistic", "simplistic"),
        ("Themed", "themed"),
        ("Animated", "animated"),
        ("Modded", "modded"),
        ("16x", "16x"),
        ("32x", "32x"),
        ("64x", "64x"),
        ("128x+", "128x"),
    ],
    "shader": [
        ("Все категории", ""),
        ("Iris", "iris"),
        ("OptiFine", "optifine"),
        ("Canvas", "canvas"),
        ("Realistic", "realistic"),
        ("Fantasy", "fantasy"),
        ("Path Tracing", "path-tracing"),
        ("Low-end", "low-end"),
    ],
}

SIDE_FILTERS = [
    ("Любая сторона", ""),
    ("Клиент", "client_side"),
    ("Сервер", "server_side"),
    ("Клиент + сервер", "both"),
]

SORT_OPTIONS = [
    ("По скачиваниям", "downloads"),
    ("По релевантности", "relevance"),
    ("Недавно обновлённые", "updated"),
    ("Новые", "newest"),
    ("По подписчикам", "follows"),
]



def fmt_num(value):
    try:
        value = int(value)
    except Exception:
        return "0"

    return f"{value:,}".replace(",", " ")


def safe_filename(name):
    name = name or "mod.jar"
    return re.sub(r'[<>:"/\\\\|?*]', "_", name)


def cache_key(url):
    return hashlib.sha1(str(url).encode("utf-8", errors="ignore")).hexdigest()


def read_cached_image(url):
    if not url:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{cache_key(url)}.bin"

    if path.exists():
        try:
            return path.read_bytes()
        except Exception:
            return None

    return None


def write_cached_image(url, data):
    if not url or not data:
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{cache_key(url)}.bin"

    try:
        path.write_bytes(data)
    except Exception:
        pass


def download_image_bytes(url, timeout=12):
    if not url:
        return None

    cached = read_cached_image(url)

    if cached:
        return cached

    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")

        if "image" not in content_type.lower():
            return None

        data = response.content

        if data:
            write_cached_image(url, data)

        return data

    except Exception:
        return None


def set_label_image(label, image_bytes, size=58):
    if not image_bytes:
        label.setText("◆")
        return

    pixmap = QPixmap()

    if not pixmap.loadFromData(image_bytes):
        label.setText("◆")
        return

    pixmap = pixmap.scaled(
        size,
        size,
        Qt.KeepAspectRatio,
        Qt.SmoothTransformation,
    )

    label.setText("")
    label.setPixmap(pixmap)


class ModrinthSearchWorker(QThread):
    success = Signal(object, int, int)
    failed = Signal(str, str)

    def __init__(self, query="", project_type="mod", category="", side="", sort_index="downloads", offset=0, limit=12, minecraft_version=None, loader=None):
        super().__init__()

        self.query = query or ""
        self.project_type = project_type or "mod"
        self.category = category or ""
        self.side = side or ""
        self.sort_index = sort_index or "downloads"
        self.offset = int(offset or 0)
        self.limit = int(limit or 24)
        self.minecraft_version = minecraft_version
        self.loader = loader

    def run(self):
        try:
            facets = [[f"project_type:{self.project_type}"]]

            if self.minecraft_version:
                facets.append([f"versions:{self.minecraft_version}"])

            if self.category:
                facets.append([f"categories:{self.category}"])

            loader_value = str(self.loader or "").strip().lower()
            loader_aliases = {
                "f": "fabric",
                "fab": "fabric",
                "fabric-loader": "fabric",
                "fg": "forge",
                "forge-loader": "forge",
                "nf": "neoforge",
                "neo": "neoforge",
                "neoforge-loader": "neoforge",
                "q": "quilt",
                "quilt-loader": "quilt",
            }
            loader_value = loader_aliases.get(loader_value, loader_value)

            if loader_value and loader_value not in {"vanilla", "any", "любой", "none", "no"} and self.project_type in {"mod", "modpack"}:
                facets.append([f"categories:{loader_value}"])

            if self.side == "client_side":
                facets.append(["client_side:required", "client_side:optional"])
            elif self.side == "server_side":
                facets.append(["server_side:required", "server_side:optional"])
            elif self.side == "both":
                facets.append(["client_side:required"])
                facets.append(["server_side:required"])

            params = {
                "query": self.query,
                "limit": self.limit,
                "offset": self.offset,
                "index": self.sort_index,
                "facets": json.dumps(facets),
            }

            response = requests.get(
                f"{MODRINTH_API}/search",
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=25,
            )
            response.raise_for_status()

            data = response.json()
            hits = data.get("hits", [])
            total_hits = int(data.get("total_hits", 0))

            prepared = []

            for hit in hits:
                item = dict(hit)
                # ВАЖНО: не скачиваем иконки на этапе поиска.
                # Раньше Nexus ждал до 24 HTTP-запросов к картинкам перед показом карточек,
                # из-за чего страница «Моды» выглядела зависшей при медленном интернете/Modrinth.
                item["_icon_bytes"] = None
                prepared.append(item)

            self.success.emit(prepared, total_hits, self.offset)

        except Exception as error:
            self.failed.emit(str(error), traceback.format_exc())


class ProjectDetailsWorker(QThread):
    success = Signal(object)
    failed = Signal(str, str)

    def __init__(self, project):
        super().__init__()
        self.project = project or {}

    def run(self):
        try:
            project_id = self.project.get("project_id") or self.project.get("slug")

            if not project_id:
                raise RuntimeError("У проекта нет project_id.")

            response = requests.get(
                f"{MODRINTH_API}/project/{project_id}",
                headers={"User-Agent": USER_AGENT},
                timeout=25,
            )
            response.raise_for_status()

            details = response.json()

            result = dict(self.project)
            result.update(details)

            result["_icon_bytes"] = download_image_bytes(result.get("icon_url"))

            gallery = result.get("gallery") or []
            screenshots = []

            for item in gallery[:6]:
                if isinstance(item, dict):
                    url = item.get("url") or item.get("raw_url")
                    title = item.get("title") or item.get("description") or ""
                else:
                    url = None
                    title = ""

                data = download_image_bytes(url)

                if data:
                    screenshots.append({
                        "title": title,
                        "url": url,
                        "bytes": data,
                    })

            result["_screenshots"] = screenshots

            self.success.emit(result)

        except Exception as error:
            self.failed.emit(str(error), traceback.format_exc())





class ModDetailsDialog(QDialog):
    def __init__(self, project, parent=None):
        super().__init__(parent)

        self.project = project or {}
        self.worker = None

        self.setWindowTitle(self.project.get("title") or "Modrinth")
        self.resize(860, 720)

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 18, 18, 18)
        root.setSpacing(14)

        top = QHBoxLayout()
        top.setSpacing(14)

        self.icon_label = QLabel("◆")
        self.icon_label.setObjectName("ModDetailsIcon")
        self.icon_label.setAlignment(Qt.AlignCenter)
        self.icon_label.setFixedSize(86, 86)

        set_label_image(self.icon_label, self.project.get("_icon_bytes"), 78)

        title_block = QVBoxLayout()
        title_block.setSpacing(4)

        self.title_label = QLabel(self.project.get("title") or self.project.get("slug") or "Unknown mod")
        self.title_label.setObjectName("PageTitle")
        self.title_label.setWordWrap(True)

        self.meta_label = QLabel(
            f'by {self.project.get("author", "unknown")}  |  '
            f'{fmt_num(self.project.get("downloads", 0))} скачиваний'
        )
        self.meta_label.setObjectName("InstanceMeta")

        title_block.addWidget(self.title_label)
        title_block.addWidget(self.meta_label)

        top.addWidget(self.icon_label)
        top.addLayout(title_block, 1)

        summary = QLabel(self.project.get("description", "Описание не найдено."))
        summary.setObjectName("PanelText")
        summary.setWordWrap(True)

        self.full_description = QTextEdit()
        self.full_description.setObjectName("ModDescriptionBox")
        self.full_description.setReadOnly(True)
        self.full_description.setPlainText("Загрузка полного описания...")
        self.full_description.setMinimumHeight(210)

        screenshots_title = QLabel("Скриншоты")
        screenshots_title.setObjectName("PanelTitle")

        self.screenshots_row = QHBoxLayout()
        self.screenshots_row.setSpacing(12)

        self.screenshots_empty = QLabel("Скриншоты загружаются...")
        self.screenshots_empty.setObjectName("EmptyText")
        self.screenshots_row.addWidget(self.screenshots_empty)

        buttons = QHBoxLayout()

        open_button = QPushButton("Открыть Modrinth")
        open_button.setObjectName("SecondaryButton")
        open_button.clicked.connect(self.open_modrinth)

        close_button = QPushButton("Закрыть")
        close_button.setObjectName("PrimaryButton")
        close_button.clicked.connect(self.accept)

        buttons.addWidget(open_button)
        buttons.addStretch()
        buttons.addWidget(close_button)

        root.addLayout(top)
        root.addWidget(summary)
        root.addWidget(self.full_description)
        root.addWidget(screenshots_title)
        root.addLayout(self.screenshots_row)
        root.addStretch()
        root.addLayout(buttons)

        self.load_details()

    def load_details(self):
        self.worker = ProjectDetailsWorker(self.project)
        self.worker.success.connect(self.on_details_loaded)
        self.worker.failed.connect(self.on_details_failed)
        self.worker.start()

    def on_details_loaded(self, data):
        set_label_image(self.icon_label, data.get("_icon_bytes"), 78)

        title = data.get("title") or self.project.get("title") or "Unknown mod"
        author = data.get("author") or self.project.get("author") or "unknown"
        downloads = data.get("downloads") or self.project.get("downloads") or 0

        self.title_label.setText(title)
        self.meta_label.setText(f"by {author}  |  {fmt_num(downloads)} скачиваний")

        body = data.get("body") or data.get("description") or "Полное описание не найдено."
        self.full_description.setPlainText(body)

        clear_layout(self.screenshots_row)

        screenshots = data.get("_screenshots") or []

        if not screenshots:
            empty = QLabel("У этого проекта нет скриншотов на Modrinth.")
            empty.setObjectName("PanelText")
            self.screenshots_row.addWidget(empty)
            self.screenshots_row.addStretch()
            return

        for shot in screenshots[:4]:
            label = QLabel()
            label.setObjectName("ModScreenshot")
            label.setAlignment(Qt.AlignCenter)
            label.setFixedSize(180, 105)
            set_label_image(label, shot.get("bytes"), 170)
            self.screenshots_row.addWidget(label)

        self.screenshots_row.addStretch()

    def on_details_failed(self, error_text, details):
        self.full_description.setPlainText(
            "Не удалось загрузить подробное описание.\n\n"
            + str(error_text)
        )

        clear_layout(self.screenshots_row)
        empty = QLabel("Скриншоты не загрузились.")
        empty.setObjectName("PanelText")
        self.screenshots_row.addWidget(empty)
        self.screenshots_row.addStretch()

    def open_modrinth(self):
        slug = self.project.get("slug") or self.project.get("project_id")

        if slug:
            project_type = self.project.get("project_type") or "mod"
            path_by_type = {
                "mod": "mod",
                "modpack": "modpack",
                "resourcepack": "resourcepack",
                "shader": "shader",
            }
            web_path = path_by_type.get(project_type, "mod")
            webbrowser.open(f"https://modrinth.com/{web_path}/{slug}")




class ModpackImportWorker(QThread):
    status = Signal(str)
    progress = Signal(int)
    success = Signal(object)
    failed = Signal(str, str)

    def __init__(self, archive_path, ram_mb=4096):
        super().__init__()
        self.archive_path = archive_path
        self.ram_mb = ram_mb

    def run(self):
        try:
            from mods.modpack_importer import ModpackImporter

            importer = ModpackImporter(
                progress_callback=lambda value: self.progress.emit(int(value or 0)),
                status_callback=lambda text: self.status.emit(str(text)),
                detail_callback=lambda text: self.status.emit(str(text)),
            )
            instance = importer.import_mrpack(self.archive_path, ram_mb=self.ram_mb)
            self.success.emit(instance)
        except Exception as error:
            self.failed.emit(str(error), traceback.format_exc())


class ModpackDirectInstallWorker(QThread):
    status = Signal(str)
    progress = Signal(int)
    success = Signal(object)
    failed = Signal(str, str)

    def __init__(self, project, ram_mb=4096):
        super().__init__()
        self.project = project or {}
        self.ram_mb = ram_mb

    def run(self):
        try:
            project_id = self.project.get("project_id") or self.project.get("slug")
            if not project_id:
                raise RuntimeError("У модпака нет project_id.")

            self.status.emit("Получаем версию модпака...")
            resp = requests.get(
                f"https://api.modrinth.com/v2/project/{project_id}/version",
                headers={"User-Agent": USER_AGENT},
                params={"loaders": '["fabric","forge","neoforge","quilt"]'},
                timeout=25,
            )
            resp.raise_for_status()
            versions = resp.json()
            if not versions:
                raise RuntimeError("У модпака нет доступных версий.")

            version = versions[0]
            files = version.get("files") or []
            mrpack_file = None
            for f in files:
                if f.get("filename", "").endswith(".mrpack"):
                    mrpack_file = f
                    break
            if not mrpack_file:
                raise RuntimeError("Не найден .mrpack файл в версии модпака.")

            download_url = mrpack_file.get("url")
            if not download_url:
                raise RuntimeError("У .mrpack файла нет URL для скачивания.")

            from core.updater import UPDATES_DIR
            UPDATES_DIR.mkdir(parents=True, exist_ok=True)

            safe_name = re.sub(r"[^a-zA-Z0-9_.()\- ]+", "_", mrpack_file["filename"])
            target = UPDATES_DIR / safe_name
            tmp = target.with_suffix(".tmp")

            self.status.emit(f"Скачиваем {mrpack_file['filename']}...")
            resp = requests.get(download_url, headers={"User-Agent": USER_AGENT}, stream=True, timeout=60)
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with open(tmp, "wb") as f:
                for chunk in resp.iter_content(1024 * 256):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total:
                            self.progress.emit(int(downloaded / total * 100))

            tmp.replace(target)

            from mods.modpack_importer import ModpackImporter
            importer = ModpackImporter(
                progress_callback=lambda value: self.progress.emit(int(value or 0)),
                status_callback=lambda text: self.status.emit(str(text)),
                detail_callback=lambda text: self.status.emit(str(text)),
            )
            instance = importer.import_mrpack(str(target), ram_mb=self.ram_mb)
            self.success.emit(instance)
        except Exception as error:
            self.failed.emit(str(error), traceback.format_exc())


class ModsPage(QWidget):
    def __init__(self):
        super().__init__()

        self.instance_manager = get_instance_manager()
        self.instances = []
        self.results = []
        self.total_hits = 0
        self.offset = 0
        self.limit = 10

        self.search_worker = None
        self.install_worker = None
        self.modpack_worker = None
        self.modpack_direct_worker = None
        self.progress_dialog = None
        self.did_autoload = False
        self.search_busy = False
        self.current_results = []
        self._last_columns = 0
        self._pending_search_reset = False
        self._debounce_timer = QTimer(self)
        self._debounce_timer.setSingleShot(True)
        self._debounce_timer.timeout.connect(self._run_scheduled_search)
        self.type_buttons = {}

        self.build_ui()
        self.load_instances()

    def toggle_advanced_filters(self):
        collapsed = self.advanced_filters_widget.isVisible()
        self.set_advanced_filters_collapsed(collapsed)
        get_launcher_settings().set_mods_filters_collapsed(collapsed)

    def set_advanced_filters_collapsed(self, collapsed):
        self.advanced_filters_widget.setVisible(not collapsed)
        self.toggle_filters_btn.setText("Показать фильтры" if collapsed else "Скрыть фильтры")

    def showEvent(self, event):
        super().showEvent(event)

        if not self.did_autoload:
            self.did_autoload = True
            QTimer.singleShot(250, self.load_all_mods_first_page)

    def build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 14, 20, 14)
        root.setSpacing(8)

        # ── Content type tabs: always visible, so Nexus clearly separates content ──
        self.type_tabs_row = QHBoxLayout()
        self.type_tabs_row.setSpacing(8)

        for label, value, hint in [
            ("Моды", "mod", "JAR в папку mods"),
            ("Модпаки", "modpack", "MRPACK → новая сборка"),
            ("Шейдеры", "shader", "ZIP в shaderpacks"),
            ("Ресурспаки", "resourcepack", "ZIP в resourcepacks"),
        ]:
            btn = QPushButton(label)
            btn.setObjectName("ContentTypeTab")
            btn.setCursor(Qt.PointingHandCursor)
            btn.setCheckable(True)
            btn.setToolTip(hint)
            btn.clicked.connect(lambda checked=False, v=value: self.apply_project_type(v))
            self.type_buttons[value] = btn
            self.type_tabs_row.addWidget(btn)

        self.type_tabs_row.addStretch()

        # ── Compact top bar (always visible) ──
        compact_bar = QHBoxLayout()
        compact_bar.setSpacing(6)

        self.query_input = QLineEdit()
        self.query_input.setPlaceholderText("sodium, iris, jei...")
        self.query_input.returnPressed.connect(self.search_clicked)
        self.query_input.setMinimumWidth(140)

        self.search_btn = QPushButton("Найти")
        self.search_btn.setObjectName("PrimaryButton")
        self.search_btn.clicked.connect(self.search_clicked)
        self.search_btn.setFixedHeight(34)

        settings = get_launcher_settings()
        default_collapsed = settings.get_mods_filters_collapsed()
        self.toggle_filters_btn = QPushButton("Показать фильтры" if default_collapsed else "Скрыть фильтры")
        self.toggle_filters_btn.setObjectName("ToggleFiltersButton")
        self.toggle_filters_btn.setCursor(Qt.PointingHandCursor)
        self.toggle_filters_btn.clicked.connect(self.toggle_advanced_filters)
        self.toggle_filters_btn.setFixedHeight(34)

        self.instance_combo = QComboBox()
        self.instance_combo.setMinimumWidth(120)
        self.instance_combo.currentIndexChanged.connect(self.on_instance_changed)

        self.compact_count_label = QLabel("")
        self.compact_count_label.setObjectName("CompactStatus")
        self.compact_count_label.setFixedHeight(34)

        compact_bar.addWidget(self.query_input, 1)
        compact_bar.addWidget(self.search_btn)
        compact_bar.addWidget(self.toggle_filters_btn)
        compact_bar.addWidget(self.instance_combo)
        compact_bar.addWidget(self.compact_count_label)

        # ── Advanced filters widget (collapsible) ──
        self.advanced_filters_widget = QFrame()
        self.advanced_filters_widget.setObjectName("ModsAdvancedFilters")
        adv = QVBoxLayout(self.advanced_filters_widget)
        adv.setContentsMargins(14, 12, 14, 12)
        adv.setSpacing(8)

        title = QLabel("Фильтры каталога")
        title.setObjectName("SectionTitle")

        description = QLabel("Компактный каталог: быстрые подборки, категория, сторона и сортировка. Раздел выбирается верхними вкладками.")
        description.setObjectName("PageDescription")
        description.setWordWrap(True)

        # Shortcut cards
        self.shortcut_row = QGridLayout()
        self.shortcut_row.setHorizontalSpacing(8)
        self.shortcut_row.setVerticalSpacing(8)
        shortcuts = [
            ("⚡", "FPS Boost", "Sodium + Lithium", "mod", "optimization", "sodium"),
            ("🌄", "Шейдеры", "Iris / Complementary", "shader", "", "complementary"),
            ("🧱", "Vanilla+", "карта, подсказки, QoL", "mod", "utility", "jade"),
            ("🎨", "Ресурспаки", "Fresh Animations / Faithful", "resourcepack", "vanilla-like", "fresh animations"),
        ]
        for idx, data in enumerate(shortcuts):
            self.shortcut_row.addWidget(self.create_shortcut_card(*data), idx // 4, idx % 4)

        # Stats row
        self.stats_row = QGridLayout()
        self.stats_row.setHorizontalSpacing(8)
        self.stats_row.setVerticalSpacing(8)
        self.results_stat = self.create_stat_card("Найдено", "0", "по фильтру")
        self.visible_stat = self.create_stat_card("Показано", "0", "на странице")
        self.compat_stat = self.create_stat_card("Сборка", "Нет", "выбери профиль")
        self.source_stat = self.create_stat_card("Источник", "Modrinth", "каталог")
        self.type_stat = self.create_stat_card("Раздел", "Моды", "тип контента")
        for idx, card in enumerate([self.results_stat, self.visible_stat, self.compat_stat, self.source_stat, self.type_stat]):
            self.stats_row.addWidget(card, idx // 3, idx % 3)

        # Filter controls
        controls = QGridLayout()
        controls.setHorizontalSpacing(8)
        controls.setVerticalSpacing(8)

        self.type_combo = QComboBox()
        self.type_combo.setMinimumWidth(110)
        for item in PROJECT_TYPES:
            self.type_combo.addItem(item["label"], item["value"])
        self.type_combo.currentIndexChanged.connect(self.on_type_changed)
        self.type_combo.setToolTip("Выбери раздел каталога: моды, модпаки, ресурспаки или шейдеры.")

        self.category_combo = QComboBox()
        self.category_combo.setMinimumWidth(120)
        self.category_combo.currentIndexChanged.connect(self.schedule_search)

        self.side_combo = QComboBox()
        self.side_combo.setMinimumWidth(110)
        for label, value in SIDE_FILTERS:
            self.side_combo.addItem(label, value)
        self.side_combo.currentIndexChanged.connect(self.schedule_search)

        self.sort_combo = QComboBox()
        self.sort_combo.setMinimumWidth(120)
        for label, value in SORT_OPTIONS:
            self.sort_combo.addItem(label, value)
        self.sort_combo.currentIndexChanged.connect(self.schedule_search)

        smart_button = QPushButton("Smart Builder")
        smart_button.setObjectName("SecondaryButton")
        smart_button.clicked.connect(self.open_smart_builder)

        import_pack_button = QPushButton("Импорт .mrpack")
        import_pack_button.setObjectName("SecondaryButton")
        import_pack_button.clicked.connect(self.import_mrpack)

        reset_filters_button = QPushButton("Сбросить фильтры")
        reset_filters_button.setObjectName("SecondaryButton")
        reset_filters_button.clicked.connect(self.reset_filters)

        self.type_combo.setVisible(False)

        controls.addWidget(self.category_combo, 0, 0)
        controls.addWidget(self.side_combo, 0, 1)
        controls.addWidget(self.sort_combo, 0, 2)
        controls.addWidget(smart_button, 0, 3)
        controls.addWidget(import_pack_button, 1, 0)
        controls.addWidget(reset_filters_button, 1, 1)
        controls.setColumnStretch(2, 1)

        adv.addWidget(title)
        adv.addWidget(description)
        adv.addLayout(self.shortcut_row)
        adv.addLayout(controls)

        # Status label
        self.status_label = QLabel("Популярные моды загрузятся автоматически.")
        self.status_label.setObjectName("PanelText")

        # ── Scroll area for mod results ──
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.scroll.setObjectName("ScrollArea")

        self.container = QWidget()
        self.grid = QGridLayout(self.container)
        self.grid.setContentsMargins(2, 2, 2, 2)
        self.grid.setHorizontalSpacing(14)
        self.grid.setVerticalSpacing(14)

        self.scroll.setWidget(self.container)

        # ── Bottom bar ──
        bottom = QHBoxLayout()

        self.load_more_button = QPushButton("Загрузить ещё")
        self.load_more_button.setObjectName("SecondaryButton")
        self.load_more_button.clicked.connect(self.load_more)
        self.load_more_button.setEnabled(False)

        bottom.addStretch()
        bottom.addWidget(self.load_more_button)

        # ── Assemble ──
        root.addLayout(self.type_tabs_row)
        root.addLayout(compact_bar)
        root.addWidget(self.advanced_filters_widget)
        root.addWidget(self.status_label)
        root.addWidget(self.scroll, 1)
        root.addLayout(bottom)

        self.on_type_changed(search=False)
        self.set_advanced_filters_collapsed(default_collapsed)


    def create_shortcut_card(self, emoji, title, desc, project_type, category, query):
        card = QPushButton(f"{emoji}  {title}\n{desc}")
        card.setObjectName("MinecraftShortcutCard")
        card.setCursor(Qt.PointingHandCursor)
        card.clicked.connect(lambda checked=False: self.apply_shortcut(project_type, category, query))
        return card

    def apply_shortcut(self, project_type, category, query):
        type_index = self.type_combo.findData(project_type)
        if type_index >= 0:
            self.type_combo.blockSignals(True)
            self.type_combo.setCurrentIndex(type_index)
            self.type_combo.blockSignals(False)
            self.on_type_changed(search=False)

        category_index = self.category_combo.findData(category)
        if category_index >= 0:
            self.category_combo.setCurrentIndex(category_index)

        self.query_input.setText(query)
        self.start_search(reset=True)

    def create_stat_card(self, title, value, desc):
        card = QFrame()
        card.setObjectName("DownloadSummaryCard")

        layout = QVBoxLayout(card)
        layout.setContentsMargins(14, 12, 14, 12)
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



    def project_type_install_word(self, project_type=None):
        project_type = project_type or self.selected_project_type()
        return {
            "mod": "мод",
            "resourcepack": "ресурспак",
            "shader": "шейдер",
            "modpack": "модпак",
        }.get(project_type, "проект")

    def project_type_install_action(self, project_type=None):
        project_type = project_type or self.selected_project_type()
        return {
            "mod": "Установить мод",
            "resourcepack": "Установить ресурспак",
            "shader": "Установить шейдер",
            "modpack": "Импортировать модпак",
        }.get(project_type, "Установить")

    def project_type_from_project(self, project):
        """Use the real Modrinth project_type when it is present.

        This is important for automatic separation:
        - mod -> .minecraft/mods
        - shader -> .minecraft/shaderpacks
        - resourcepack -> .minecraft/resourcepacks
        - modpack -> .mrpack import/new instance
        """
        value = str((project or {}).get("project_type") or "").lower().strip()
        if value in {"mod", "modpack", "resourcepack", "shader"}:
            return value
        return self.selected_project_type()

    def project_type_label(self, project_type):
        return {
            "mod": "Мод",
            "modpack": "Модпак",
            "resourcepack": "Ресурспак",
            "shader": "Шейдер",
        }.get(project_type, "Проект")

    def selected_project_type(self):
        value = self.type_combo.currentData() if hasattr(self, "type_combo") else None
        return str(value or "mod")

    def apply_project_type(self, project_type, search=True):
        index = self.type_combo.findData(project_type) if hasattr(self, "type_combo") else -1
        if index >= 0:
            self.type_combo.blockSignals(True)
            self.type_combo.setCurrentIndex(index)
            self.type_combo.blockSignals(False)

        self.on_type_changed(search=search)

    def sync_type_tabs(self):
        current = self.selected_project_type()
        for value, button in getattr(self, "type_buttons", {}).items():
            button.blockSignals(True)
            button.setChecked(value == current)
            button.setProperty("active", value == current)
            button.style().unpolish(button)
            button.style().polish(button)
            button.blockSignals(False)

    def selected_project_type_info(self):
        current = self.selected_project_type()
        for item in PROJECT_TYPES:
            if item["value"] == current:
                return item
        return PROJECT_TYPES[0]

    def selected_category(self):
        value = self.category_combo.currentData() if hasattr(self, "category_combo") else None
        return str(value or "")

    def selected_side(self):
        value = self.side_combo.currentData() if hasattr(self, "side_combo") else None
        return str(value or "")

    def selected_sort(self):
        value = self.sort_combo.currentData() if hasattr(self, "sort_combo") else None
        return str(value or "downloads")

    def on_type_changed(self, *args, search=True):
        project_type = self.selected_project_type()
        info = self.selected_project_type_info()
        self.sync_type_tabs()

        if hasattr(self, "category_combo"):
            self.category_combo.blockSignals(True)
            self.category_combo.clear()
            for label, value in TYPE_CATEGORY_PRESETS.get(project_type, TYPE_CATEGORY_PRESETS["mod"]):
                self.category_combo.addItem(label, value)
            self.category_combo.blockSignals(False)

        if hasattr(self, "query_input"):
            self.query_input.setPlaceholderText(info.get("placeholder", "поиск..."))

        if hasattr(self, "type_stat"):
            self.type_stat.value_label.setText(info.get("label", project_type))
            self.type_stat.desc_label.setText("можно установить" if info.get("installable") else "только просмотр")

        if hasattr(self, "status_label"):
            status = info.get("description", "")
            if project_type == "shader" and self.selected_instance():
                status += "  •  " + shader_status_text(self.selected_instance())
            self.status_label.setText(status)

        if hasattr(self, "side_combo"):
            self.side_combo.setEnabled(project_type in {"mod", "modpack"})
            if project_type not in {"mod", "modpack"}:
                self.side_combo.blockSignals(True)
                index = self.side_combo.findData("")
                if index >= 0:
                    self.side_combo.setCurrentIndex(index)
                self.side_combo.blockSignals(False)

        if search:
            self.schedule_search()

    def load_instances(self):
        self.instance_combo.clear()

        try:
            if hasattr(self.instance_manager, "reload"):
                self.instance_manager.reload()

            self.instances = self.instance_manager.get_instances()
        except Exception:
            self.instances = []

        if not self.instances:
            self.instance_combo.addItem("Нет сборок", None)
            if hasattr(self, "compat_stat"):
                self.compat_stat.value_label.setText("Нет")
                self.compat_stat.desc_label.setText("сначала создай сборку")
            return

        for instance in self.instances:
            name = instance.get("name", "Без названия")
            version = instance.get("minecraft_version", "unknown")
            loader = instance.get("loader", "vanilla")
            warning = " ⚠ без модов" if str(loader).lower() == "vanilla" else ""
            self.instance_combo.addItem(f"{name} | {version} | {loader}{warning}", instance)

        if hasattr(self, "compat_stat"):
            selected = self.selected_instance()
            if selected:
                self.compat_stat.value_label.setText(str(selected.get("loader", "vanilla")).upper())
                self.compat_stat.desc_label.setText(str(selected.get("minecraft_version", "unknown")))
            if hasattr(self, "type_stat"):
                info = self.selected_project_type_info()
                self.type_stat.value_label.setText(info.get("label", self.selected_project_type()))
                self.type_stat.desc_label.setText(self.category_combo.currentText() if hasattr(self, "category_combo") else "тип контента")


    def on_instance_changed(self, *args):
        self.update_compatibility_stat()
        if self.selected_project_type() == "shader" and hasattr(self, "status_label") and self.selected_instance():
            self.status_label.setText(self.selected_project_type_info().get("description", "") + "  •  " + shader_status_text(self.selected_instance()))
        if self.results:
            self.render_results()
        if getattr(self, "did_autoload", False):
            self.schedule_search()

    def update_compatibility_stat(self):
        selected = self.selected_instance()
        if not hasattr(self, "compat_stat"):
            return
        if selected:
            self.compat_stat.value_label.setText(str(selected.get("loader", "vanilla")).upper())
            self.compat_stat.desc_label.setText(str(selected.get("minecraft_version", "unknown")))
        else:
            self.compat_stat.value_label.setText("Нет")
            self.compat_stat.desc_label.setText("сначала создай сборку")

    def selected_instance(self):
        data = self.instance_combo.currentData()

        if isinstance(data, dict):
            return data

        return None

    def schedule_search(self, *args, reset=True):
        """Debounced search used by filter controls.

        Fixes the old behaviour where changing several filters while Modrinth
        was still loading silently did nothing. Now the last requested search is
        queued and runs after the current worker finishes.
        """
        self._pending_search_reset = bool(reset) or getattr(self, "_pending_search_reset", False)

        if self.search_busy or (self.search_worker and self.search_worker.isRunning()):
            return

        if hasattr(self, "_debounce_timer"):
            self._debounce_timer.start(220)
        else:
            self.start_search(reset=reset)

    def _run_scheduled_search(self):
        reset = True if getattr(self, "_pending_search_reset", True) else False
        self._pending_search_reset = False
        self.start_search(reset=reset)

    def reset_filters(self):
        if hasattr(self, "query_input"):
            self.query_input.clear()

        for combo, value in [
            (getattr(self, "type_combo", None), "mod"),
            (getattr(self, "side_combo", None), ""),
            (getattr(self, "sort_combo", None), "downloads"),
        ]:
            if combo is None:
                continue
            index = combo.findData(value)
            if index >= 0:
                combo.blockSignals(True)
                combo.setCurrentIndex(index)
                combo.blockSignals(False)

        self.on_type_changed(search=False)

        if hasattr(self, "category_combo"):
            index = self.category_combo.findData("")
            if index >= 0:
                self.category_combo.blockSignals(True)
                self.category_combo.setCurrentIndex(index)
                self.category_combo.blockSignals(False)

        self.start_search(reset=True)

    def search_clicked(self, *args):
        self.start_search(reset=True)

    def load_all_mods_first_page(self):
        if self.search_busy:
            return

        self.start_search(reset=True, force_query="")

    def load_more(self, *args):
        if self.search_busy:
            return

        self.start_search(reset=False)

    def start_search(self, reset=True, force_query=None):
        if self.search_worker and self.search_worker.isRunning():
            self._pending_search_reset = bool(reset) or getattr(self, "_pending_search_reset", False)
            return

        if reset:
            self.offset = 0
            self.results = []
            self.current_results = []
            self._last_columns = 0
            self.render_results()

        query = self.query_input.text().strip()

        if force_query is not None:
            query = force_query

        instance = self.selected_instance()

        minecraft_version = None
        loader = None

        if instance:
            minecraft_version = instance.get("minecraft_version")
            loader = instance.get("loader")

        self.search_busy = True
        active_filters = []
        if self.selected_project_type_info():
            active_filters.append(self.selected_project_type_info().get("label", self.selected_project_type()))
        if self.selected_category():
            active_filters.append(self.category_combo.currentText())
        if self.selected_side():
            active_filters.append(self.side_combo.currentText())
        if loader:
            active_filters.append(str(loader))
        if minecraft_version:
            active_filters.append(str(minecraft_version))
        suffix = " • ".join(active_filters)
        self.status_label.setText("Загрузка Modrinth" + (f": {suffix}" if suffix else "..."))
        self.load_more_button.setEnabled(False)

        self.search_worker = ModrinthSearchWorker(
            query=query,
            project_type=self.selected_project_type(),
            category=self.selected_category(),
            side=self.selected_side() if self.selected_project_type() in {"mod", "modpack"} else "",
            sort_index=self.selected_sort(),
            offset=self.offset,
            limit=self.limit,
            minecraft_version=minecraft_version,
            loader=loader,
        )
        self.search_worker.success.connect(self.on_search_success)
        self.search_worker.failed.connect(self.on_search_failed)
        self.search_worker.start()

    def on_search_success(self, hits, total_hits, offset):
        self.search_busy = False
        self.total_hits = total_hits

        if offset == 0:
            self.results = list(hits)
        else:
            self.results.extend(hits)

        self.current_results = self.results
        self.offset = len(self.results)

        self.render_results()

        self.status_label.setText(f"Показано {len(self.results)} из {self.total_hits}")
        self.compact_count_label.setText(f"{len(self.results)} / {self.total_hits}")

        if hasattr(self, "results_stat"):
            self.results_stat.value_label.setText(fmt_num(self.total_hits))
            self.visible_stat.value_label.setText(fmt_num(len(self.results)))
            selected = self.selected_instance()
            if selected:
                self.compat_stat.value_label.setText(str(selected.get("loader", "vanilla")).upper())
                self.compat_stat.desc_label.setText(str(selected.get("minecraft_version", "unknown")))
            if hasattr(self, "type_stat"):
                info = self.selected_project_type_info()
                self.type_stat.value_label.setText(info.get("label", self.selected_project_type()))
                self.type_stat.desc_label.setText(self.category_combo.currentText() if hasattr(self, "category_combo") else "тип контента")

        self.load_more_button.setEnabled(len(self.results) < self.total_hits)

        if getattr(self, "_pending_search_reset", False):
            QTimer.singleShot(60, self._run_scheduled_search)

    def on_search_failed(self, error_text, details):
        self.search_busy = False
        self.status_label.setText("Ошибка загрузки Modrinth.")
        self.load_more_button.setEnabled(False)

        if getattr(self, "_pending_search_reset", False):
            QTimer.singleShot(60, self._run_scheduled_search)

        box = QMessageBox(self)
        box.setIcon(QMessageBox.Critical)
        box.setWindowTitle("Ошибка Modrinth")
        box.setText("Не удалось загрузить моды.")
        box.setInformativeText(str(error_text))
        box.setDetailedText(str(details))
        box.exec()


    def responsive_columns(self):
        try:
            width = self.scroll.viewport().width()
        except Exception:
            width = self.width()

        if width >= 1200:
            return 2
        return 1

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if hasattr(self, "grid") and self.results:
            columns = self.responsive_columns()
            if columns != getattr(self, "_last_columns", 0):
                self.render_results()

    def render_results(self):
        clear_layout(self.grid)

        if not self.results:
            empty = QLabel("Каталог пока не загружен. Нажми «Найти» или выбери фильтры.")
            empty.setObjectName("PanelText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(140)
            self.grid.addWidget(empty, 0, 0, 1, 2)
            return

        columns = self.responsive_columns()
        self._last_columns = columns

        for index, project in enumerate(self.results):
            row = index // columns
            col = index % columns
            self.grid.addWidget(self.create_mod_card(project), row, col)

        self.grid.setRowStretch((len(self.results) // columns) + 1, 1)

    def create_mod_card(self, project):
        card = QFrame()
        card.setObjectName("ModResultCard")
        card.setMinimumHeight(142)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(12, 9, 12, 9)
        layout.setSpacing(6)

        selected_instance = self.selected_instance()
        project_type = self.project_type_from_project(project)
        state = installed_state(selected_instance, project, project_type) if selected_instance else {
            "state": "no_instance",
            "label": "Нет сборки",
            "record": None,
        }

        top = QHBoxLayout()
        top.setSpacing(10)

        icon_box = RemoteImageLabel(44, 44, "◆")
        icon_box.setObjectName("ModIconImage")
        icon_box.setAlignment(Qt.AlignCenter)
        icon_box.set_remote_image(project.get("icon_url"))

        title_block = QVBoxLayout()
        title_block.setSpacing(2)

        title = QLabel(project.get("title") or project.get("slug") or "Unknown mod")
        title.setObjectName("InstanceTitle")
        title.setWordWrap(True)

        author = QLabel(f'by {project.get("author", "unknown")}')
        author.setObjectName("InstanceMeta")

        install_status = QLabel(self.install_state_text(state))
        install_status.setObjectName("StatusBadge" if state.get("state") == "installed" else "SmallBadge")

        title_block.addWidget(title)
        title_block.addWidget(author)
        title_block.addWidget(install_status, 0, Qt.AlignLeft)

        top.addWidget(icon_box)
        top.addLayout(title_block, 1)

        description = QLabel(project.get("description", "Без описания"))
        description.setObjectName("PanelText")
        description.setWordWrap(True)
        description.setMaximumHeight(32)

        meta_line = QHBoxLayout()
        meta_line.setSpacing(6)

        meta_line.addWidget(self.tag(f'{fmt_num(project.get("downloads", 0))} скач.'))
        meta_line.addWidget(self.tag(f'{fmt_num(project.get("follows", 0))} подп.'))

        for cat in (project.get("categories") or [])[:2]:
            meta_line.addWidget(self.tag(cat))

        meta_line.addStretch()

        actions = QHBoxLayout()
        actions.setSpacing(6)

        type_info = self.selected_project_type_info()
        can_install = bool(type_info.get("installable"))
        is_modpack = project_type == "modpack"

        if is_modpack:
            button_text = "Импортировать модпак"
        elif can_install and state.get("state") == "not_installed":
            button_text = self.project_type_install_action(project_type)
        elif can_install:
            button_text = state.get("label", self.project_type_install_action(project_type))
        else:
            button_text = "Скоро импорт"

        install = QPushButton(button_text)
        install.setObjectName("SmallGhostButton" if not is_modpack and state.get("state") == "installed" else "PrimaryButton")
        install.clicked.connect(lambda checked=False, p=project: self.install_project(p))

        if not can_install:
            install.setEnabled(False)
            install.setToolTip("Для этого раздела пока доступен просмотр и открытие на Modrinth.")
        elif not is_modpack and state.get("state") == "installed":
            install.setEnabled(False)
            install.setToolTip("Этот проект уже установлен в выбранную сборку. Повторная установка не нужна.")
        elif not is_modpack and state.get("state") == "missing_files":
            install.setToolTip("Запись есть, но файл потерян. Nexus переустановит совместимую версию.")

        details = QPushButton("Подробнее")
        details.setObjectName("SmallGhostButton")
        details.clicked.connect(lambda checked=False, p=project: self.show_details(p))

        open_link = QPushButton("Modrinth")
        open_link.setObjectName("SmallGhostButton")
        open_link.clicked.connect(lambda checked=False, p=project: self.open_modrinth(p))

        actions.addWidget(install)
        actions.addWidget(details)
        actions.addWidget(open_link)
        actions.addStretch()

        layout.addLayout(top)
        layout.addWidget(description)
        layout.addLayout(meta_line)
        layout.addLayout(actions)

        return card

    def install_state_text(self, state):
        code = state.get("state")
        record = state.get("record") or {}

        if code == "installed":
            version = record.get("version_number") or record.get("version_name") or "версия известна"
            return f"✓ Установлено • {version}"

        if code == "missing_files":
            return "⚠ Запись есть, файл потерян"

        if code == "no_instance":
            return "Сначала выбери сборку"

        return "Не установлен"

    def tag(self, text):
        label = QLabel(str(text))
        label.setObjectName("ModTag")
        return label

    def show_details(self, project):
        payload = dict(project or {})
        payload["project_type"] = self.project_type_from_project(payload)
        dialog = ModDetailsDialog(payload, self)
        dialog.exec()

    def install_project(self, project):
        project = dict(project or {})
        project_type = self.project_type_from_project(project)
        project["project_type"] = project_type
        type_info = self.selected_project_type_info()

        type_info = next((item for item in PROJECT_TYPES if item.get("value") == project_type), type_info)
        if not type_info.get("installable"):
            return

        if project_type == "modpack":
            self.install_modpack_direct(project)
            return

        instance = self.selected_instance()

        if not instance:
            QMessageBox.warning(
                self,
                "Нет сборки",
                "Сначала создай сборку и выбери её в списке сверху."
            )
            return

        loader = str(instance.get("loader") or "vanilla").lower()

        if project_type == "mod" and loader == "vanilla":
            QMessageBox.warning(
                self,
                "Нужна Fabric/Forge сборка",
                "Эта сборка Vanilla. В неё можно скачать .jar файл, но Minecraft не загрузит мод.\n\n"
                "Создай новую сборку с Loader = fabric, например Minecraft 1.20.1 + fabric, "
                "и выбери её сверху перед установкой мода."
            )
            return

        state = installed_state(instance, project, project_type)
        if state.get("state") == "installed":
            record = state.get("record") or {}
            QMessageBox.information(
                self,
                "Проект уже установлен",
                f'{project.get("title") or project.get("slug") or "Проект"} уже установлен в сборку "{instance.get("name", "Minecraft")}".\n\n'
                f'Версия: {record.get("version_number") or record.get("version_name") or "неизвестно"}\n'
                f'Minecraft: {record.get("minecraft_version") or instance.get("minecraft_version")}\n'
                f'Loader: {record.get("loader") or instance.get("loader")}\n\n'
                "Кнопка теперь будет показывать «Установлено», чтобы не скачивать один и тот же проект бесконечно."
            )
            self.render_results()
            return

        if self.install_worker and self.install_worker.isRunning():
            QMessageBox.information(self, "Установка уже идёт", "Дождись завершения текущей установки.")
            return

        self.progress_dialog = QProgressDialog(
            "Подготовка установки...",
            "Скрыть",
            0,
            100,
            self,
        )
        self.progress_dialog.setWindowTitle(f"Установка: {self.project_type_install_word(project_type)}")
        self.progress_dialog.setMinimumWidth(520)
        self.progress_dialog.setAutoClose(False)
        self.progress_dialog.setAutoReset(False)
        self.progress_dialog.setWindowModality(Qt.NonModal)
        self.progress_dialog.setValue(0)
        self.progress_dialog.show()

        project = dict(project)
        project["project_type"] = project_type

        self.install_worker = ModInstallerWorker(project, instance)
        self.install_worker.status.connect(self.on_install_status)
        self.install_worker.progress.connect(self.on_install_progress)
        self.install_worker.success.connect(self.on_install_success)
        self.install_worker.failed.connect(self.on_install_failed)
        self.install_worker.start()

    def install_modpack_direct(self, project):
        if self.modpack_direct_worker and self.modpack_direct_worker.isRunning():
            QMessageBox.information(self, "Установка уже идёт", "Дождись завершения текущего импорта модпака.")
            return

        ram_mb, ok = QInputDialog.getInt(
            self,
            "RAM для модпака",
            "Сколько RAM выделить новой сборке?",
            4096,
            2048,
            32768,
            512,
        )
        if not ok:
            return

        self.progress_dialog = QProgressDialog(
            "Подготовка импорта модпака...",
            "Скрыть",
            0,
            100,
            self,
        )
        self.progress_dialog.setWindowTitle(f"Импорт: {project.get('title', 'Modpack')}")
        self.progress_dialog.setMinimumWidth(560)
        self.progress_dialog.setAutoClose(False)
        self.progress_dialog.setAutoReset(False)
        self.progress_dialog.setWindowModality(Qt.NonModal)
        self.progress_dialog.setValue(0)
        self.progress_dialog.show()

        self.modpack_direct_worker = ModpackDirectInstallWorker(project, ram_mb=ram_mb)
        self.modpack_direct_worker.status.connect(self.on_modpack_import_status)
        self.modpack_direct_worker.progress.connect(self._on_modpack_direct_progress)
        self.modpack_direct_worker.success.connect(self._on_modpack_direct_success)
        self.modpack_direct_worker.failed.connect(self._on_modpack_direct_failed)
        self.modpack_direct_worker.start()

    def _on_modpack_direct_progress(self, value):
        if self.progress_dialog:
            self.progress_dialog.setValue(int(value or 0))

    def _on_modpack_direct_success(self, instance):
        if self.progress_dialog:
            self.progress_dialog.setValue(100)
            self.progress_dialog.setLabelText("Модпак импортирован.")
            self.progress_dialog.close()
            self.progress_dialog = None

        self.load_instances()

        QMessageBox.information(
            self,
            "Модпак импортирован",
            f'Создана сборка: {instance.get("name", "Modpack")}\n'
            f'Minecraft: {instance.get("minecraft_version", "unknown")}\n'
            f'Loader: {instance.get("loader", "vanilla")}'
        )

    def _on_modpack_direct_failed(self, error_text, details):
        if self.progress_dialog:
            self.progress_dialog.close()
            self.progress_dialog = None

        box = QMessageBox(self)
        box.setIcon(QMessageBox.Critical)
        box.setWindowTitle("Ошибка импорта модпака")
        box.setText("Не удалось импортировать модпак.")
        box.setInformativeText(str(error_text))
        box.setDetailedText(str(details))
        box.exec()

    def on_install_status(self, text):
        if self.progress_dialog:
            self.progress_dialog.setLabelText(str(text))

    def on_install_progress(self, value):
        if self.progress_dialog:
            self.progress_dialog.setValue(int(value or 0))

    def on_install_success(self, path):
        message = str(path or "")
        already = message.startswith("Мод уже установлен") or message.startswith("Проект уже установлен")
        project_type = self.selected_project_type()
        word = self.project_type_install_word(project_type)

        if self.progress_dialog:
            self.progress_dialog.setValue(100)
            self.progress_dialog.setLabelText(f"{word.capitalize()} уже установлен." if already else f"{word.capitalize()} установлен.")
            self.progress_dialog.close()
            self.progress_dialog = None

        if self.results:
            self.render_results()

        if project_type == "shader" and not already:
            self.handle_shader_post_install(message)
            return

        QMessageBox.information(
            self,
            "Проект уже установлен" if already else f"{word.capitalize()} установлен",
            message
        )

    def handle_shader_post_install(self, install_message):
        instance = self.selected_instance()
        if not instance:
            QMessageBox.information(self, "Шейдер установлен", install_message)
            return

        folder = shaderpacks_dir(instance)
        if has_shader_loader(instance):
            QMessageBox.information(
                self,
                "Шейдер установлен",
                f"{install_message}\n\n"
                f"Папка: {folder}\n\n"
                "В игре открой: Настройки видео → Наборы шейдеров → выбери установленный shader pack.\n\n"
                "Важно: Iris Shaders — это загрузчик шейдеров, а сам shader pack — это отдельный .zip файл."
            )
            return

        recommendation = recommended_shader_loader(instance)
        result = QMessageBox.question(
            self,
            "Шейдер установлен, но нужен загрузчик шейдеров",
            f"{install_message}\n\n"
            f"Шейдер-пак скачан в:\n{folder}\n\n"
            "Но Minecraft не покажет шейдеры без Iris/Oculus/OptiFine.\n\n"
            f"{recommendation.get('reason')}\n\n"
            f"Установить сейчас: {recommendation.get('title')}?"
        )

        if result == QMessageBox.Yes:
            old_type_index = self.type_combo.currentIndex()
            try:
                self.type_combo.blockSignals(True)
                index = self.type_combo.findData("mod")
                if index >= 0:
                    self.type_combo.setCurrentIndex(index)
                self.type_combo.blockSignals(False)

                self.install_project(recommendation)
            finally:
                self.type_combo.blockSignals(True)
                self.type_combo.setCurrentIndex(old_type_index)
                self.type_combo.blockSignals(False)
                self.on_type_changed(search=False)
        else:
            QMessageBox.information(
                self,
                "Шейдер скачан",
                "Шейдер установлен в папку shaderpacks, но в игре он появится только после установки Iris/Oculus/OptiFine."
            )

    def on_install_failed(self, error_text, details):
        if self.progress_dialog:
            self.progress_dialog.close()
            self.progress_dialog = None

        box = QMessageBox(self)
        box.setIcon(QMessageBox.Critical)
        box.setWindowTitle("Ошибка установки")
        box.setText("Не удалось установить проект.")
        box.setInformativeText(str(error_text))
        box.setDetailedText(str(details))
        box.exec()

    def import_mrpack(self):
        if self.modpack_worker and self.modpack_worker.isRunning():
            QMessageBox.information(self, "Импорт уже идёт", "Дождись завершения текущего импорта модпака.")
            return

        path, _ = QFileDialog.getOpenFileName(
            self,
            "Выбрать Modrinth modpack",
            "",
            "Modrinth Pack (*.mrpack);;All files (*.*)",
        )
        if not path:
            return

        ram_mb, ok = QInputDialog.getInt(
            self,
            "RAM для модпака",
            "Сколько RAM выделить новой сборке?",
            4096,
            2048,
            32768,
            512,
        )
        if not ok:
            return

        self.progress_dialog = QProgressDialog(
            "Подготовка импорта .mrpack...",
            "Скрыть",
            0,
            100,
            self,
        )
        self.progress_dialog.setWindowTitle("Импорт модпака")
        self.progress_dialog.setMinimumWidth(560)
        self.progress_dialog.setAutoClose(False)
        self.progress_dialog.setAutoReset(False)
        self.progress_dialog.setWindowModality(Qt.NonModal)
        self.progress_dialog.setValue(0)
        self.progress_dialog.show()

        self.modpack_worker = ModpackImportWorker(path, ram_mb=ram_mb)
        self.modpack_worker.status.connect(self.on_modpack_import_status)
        self.modpack_worker.progress.connect(self.on_modpack_import_progress)
        self.modpack_worker.success.connect(self.on_modpack_import_success)
        self.modpack_worker.failed.connect(self.on_modpack_import_failed)
        self.modpack_worker.start()

    def on_modpack_import_status(self, text):
        if self.progress_dialog:
            self.progress_dialog.setLabelText(str(text))

    def on_modpack_import_progress(self, value):
        if self.progress_dialog:
            self.progress_dialog.setValue(int(value or 0))

    def on_modpack_import_success(self, instance):
        if self.progress_dialog:
            self.progress_dialog.setValue(100)
            self.progress_dialog.setLabelText("Модпак импортирован.")
            self.progress_dialog.close()
            self.progress_dialog = None

        self.load_instances()

        QMessageBox.information(
            self,
            "Модпак импортирован",
            f'Создана сборка: {instance.get("name", "Modpack")}\n'
            f'Minecraft: {instance.get("minecraft_version", "unknown")}\n'
            f'Loader: {instance.get("loader", "vanilla")}'
        )

    def on_modpack_import_failed(self, error_text, details):
        if self.progress_dialog:
            self.progress_dialog.close()
            self.progress_dialog = None

        box = QMessageBox(self)
        box.setIcon(QMessageBox.Critical)
        box.setWindowTitle("Ошибка импорта .mrpack")
        box.setText("Не удалось импортировать модпак.")
        box.setInformativeText(str(error_text))
        box.setDetailedText(str(details))
        box.exec()

    def open_smart_builder(self):
        dialog = SmartBuilderDialog(self)
        dialog.exec()

    def open_modrinth(self, project):
        slug = project.get("slug") or project.get("project_id")

        if not slug:
            return

        project_type = self.project_type_from_project(project)
        path_by_type = {
            "mod": "mod",
            "modpack": "modpack",
            "resourcepack": "resourcepack",
            "shader": "shader",
        }
        web_path = path_by_type.get(project_type, "mod")
        webbrowser.open(f"https://modrinth.com/{web_path}/{slug}")
