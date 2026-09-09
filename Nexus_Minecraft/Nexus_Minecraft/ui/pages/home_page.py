from pathlib import Path

from PySide6.QtCore import Signal, Qt, QSize, QTimer
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QFrame,
    QProgressBar,
    QGridLayout,
    QScrollArea,
)

from ui.utils.helpers import clear_layout, elide_text

try:
    from core.instance_manager import get_instance_manager
except Exception:
    from core.instance_manager import InstanceManager

    def get_instance_manager():
        return InstanceManager()

try:
    from core.system_info import get_pc_summary
except Exception:
    get_pc_summary = None

try:
    from core.launcher_settings import get_launcher_settings
except Exception:
    get_launcher_settings = None

try:
    from core.download_manager import DownloadManager
except Exception:
    DownloadManager = None

try:
    from storage.json_store import load_json
except Exception:
    def load_json(path, default=None):
        return default or {}

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


def format_ram_mb(mb):
    try:
        value = int(mb) / 1024
        if abs(value - round(value)) < 0.05:
            return f"{int(round(value))} GB"
        return f"{value:.1f} GB"
    except Exception:
        return "—"


class HomePage(QWidget):
    navigate_requested = Signal(int)
    create_instance_requested = Signal()

    def __init__(self):
        super().__init__()

        self.instance_manager = get_instance_manager()
        self.download_manager = DownloadManager() if DownloadManager else None
        self.settings = get_launcher_settings() if get_launcher_settings else None
        self.summary_cards = {}
        self.system_value_labels = {}

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        self.scroll = QScrollArea()
        self.scroll.setObjectName("ScrollArea")
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self.content = QWidget()
        root = QVBoxLayout(self.content)
        root.setContentsMargins(22, 18, 22, 18)
        root.setSpacing(14)

        self.scroll.setWidget(self.content)
        outer.addWidget(self.scroll)

        root.addWidget(self.create_hero())
        root.addLayout(self.create_summary_strip())

        main_grid = QGridLayout()
        main_grid.setHorizontalSpacing(14)
        main_grid.setVerticalSpacing(14)
        main_grid.addWidget(self.create_instances_panel(), 0, 0)
        main_grid.addWidget(self.create_quick_start_panel(), 0, 1)
        main_grid.addWidget(self.create_activity_panel(), 1, 0)
        main_grid.addWidget(self.create_system_panel(), 1, 1)
        main_grid.setColumnStretch(0, 3)
        main_grid.setColumnStretch(1, 2)
        root.addLayout(main_grid)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh_system_info)
        self.timer.start(2000)

        self.refresh()

    # ---------- data ----------
    def refresh(self):
        self.refresh_summary()
        self.rebuild_instances_panel()
        self.rebuild_activity_panel()
        self.rebuild_quick_start_panel()
        self.refresh_system_info()
        self.refresh_hero()

    def get_instances(self):
        try:
            if hasattr(self.instance_manager, "reload"):
                self.instance_manager.reload()
            return self.instance_manager.get_instances()
        except Exception:
            return []

    def get_last_instance(self):
        instances = self.get_instances()
        if not instances:
            return None
        return max(instances, key=lambda item: item.get("last_played_at") or item.get("created_at") or "")

    def count_installed_mods(self):
        total = 0
        for instance in self.get_instances():
            index_path = Path(instance.get("path", "")) / "mods_index.json"
            data = load_json(index_path, {"mods": []})
            total += len(data.get("mods", []))
        return total

    def get_download_tasks(self):
        if not self.download_manager:
            return []
        try:
            return self.download_manager.list_tasks()
        except Exception:
            return []

    # ---------- hero ----------
    def create_hero(self):
        card = QFrame()
        card.setObjectName("CalmHero")

        layout = QHBoxLayout(card)
        layout.setContentsMargins(20, 18, 20, 18)
        layout.setSpacing(18)

        left = QVBoxLayout()
        left.setSpacing(8)

        badge = QLabel("NEXUS LAUNCHER")
        badge.setObjectName("HeroWelcome")

        title = QLabel("Чистый старт для Minecraft")
        title.setObjectName("HeroTitle")

        subtitle = QLabel(
            "Создавай сборки, ставь моды и шейдеры, запускай игру и держи всё под контролем без перегруженного интерфейса."
        )
        subtitle.setObjectName("HeroSubtitle")
        subtitle.setWordWrap(True)

        self.active_instance_badge = QLabel("Сборка не выбрана")
        self.active_instance_badge.setObjectName("StatusBadge")

        actions = QHBoxLayout()
        actions.setSpacing(10)

        open_instances = QPushButton("Сборки")
        open_instances.setObjectName("HeroPlayButton")
        play_icon = qicon("instances")
        if play_icon:
            open_instances.setIcon(play_icon)
            open_instances.setIconSize(QSize(18, 18))
        open_instances.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        create_instance = QPushButton("Новая сборка")
        create_instance.setObjectName("SecondaryButton")
        plus_icon = qicon("plus")
        if plus_icon:
            create_instance.setIcon(plus_icon)
            create_instance.setIconSize(QSize(18, 18))
        create_instance.clicked.connect(lambda checked=False: self.create_instance_requested.emit())

        browse_mods = QPushButton("Каталог")
        browse_mods.setObjectName("SecondaryButton")
        mods_icon = qicon("mods")
        if mods_icon:
            browse_mods.setIcon(mods_icon)
            browse_mods.setIconSize(QSize(18, 18))
        browse_mods.clicked.connect(lambda checked=False: self.navigate_requested.emit(2))

        actions.addWidget(open_instances)
        actions.addWidget(create_instance)
        actions.addWidget(browse_mods)
        actions.addStretch()

        left.addWidget(badge)
        left.addWidget(title)
        left.addWidget(subtitle)
        left.addWidget(self.active_instance_badge, 0, Qt.AlignLeft)
        left.addSpacing(4)
        left.addLayout(actions)

        right = QVBoxLayout()
        right.setSpacing(10)

        self.hero_tip_1 = self.create_info_chip("Последняя сборка", "—")
        self.hero_tip_2 = self.create_info_chip("RAM для Minecraft", "—")
        self.hero_tip_3 = self.create_info_chip("Каталог", "Моды и ресурспаки")

        right.addWidget(self.hero_tip_1)
        right.addWidget(self.hero_tip_2)
        right.addWidget(self.hero_tip_3)
        right.addStretch()

        layout.addLayout(left, 5)
        layout.addLayout(right, 3)
        return card

    def create_info_chip(self, title, value):
        chip = QFrame()
        chip.setObjectName("HeroInfoChip")
        box = QVBoxLayout(chip)
        box.setContentsMargins(12, 10, 12, 10)
        box.setSpacing(2)

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")
        value_label = QLabel(value)
        value_label.setObjectName("HeroStatValue")
        value_label.setWordWrap(True)

        chip.value_label = value_label
        box.addWidget(title_label)
        box.addWidget(value_label)
        return chip

    def refresh_hero(self):
        latest = self.get_last_instance()
        if latest:
            mod_count = len(load_json(Path(latest.get("path", "")) / "mods_index.json", {"mods": []}).get("mods", []))
            name = latest.get("name", "Без названия")
            mc = latest.get("minecraft_version", "unknown")
            loader = latest.get("loader", "vanilla")
            loader_version = latest.get("loader_version")
            if loader_version and loader != "vanilla":
                loader = f"{loader} {loader_version}"
            self.active_instance_badge.setText(elide_text(f"{name} · {mc} · {loader} · {mod_count} мод.", 52))
            self.active_instance_badge.setToolTip(
                f"{name} · Minecraft {mc} · {loader} · {mod_count} модов"
            )
            self.hero_tip_1.value_label.setText(elide_text(name, 24))
        else:
            self.active_instance_badge.setText("Создай первую сборку, чтобы начать")
            self.hero_tip_1.value_label.setText("Пока нет сборок")

        if self.settings:
            self.hero_tip_2.value_label.setText(format_ram_mb(self.settings.get_ram_mb()))
        else:
            self.hero_tip_2.value_label.setText("—")

    # ---------- summary ----------
    def create_summary_strip(self):
        row = QHBoxLayout()
        row.setSpacing(12)

        self.summary_cards["instances"] = self.create_summary_card("Сборки", "0", "готово к запуску")
        self.summary_cards["mods"] = self.create_summary_card("Моды", "0", "установлено")
        self.summary_cards["downloads"] = self.create_summary_card("Загрузки", "0", "в истории")
        self.summary_cards["status"] = self.create_summary_card("Статус", "Готово", "лаунчер активен")

        for key in ["instances", "mods", "downloads", "status"]:
            row.addWidget(self.summary_cards[key])

        return row

    def create_summary_card(self, title, value, meta):
        card = QFrame()
        card.setObjectName("OverviewStatCard")
        card.setMinimumHeight(84)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(4)

        title_label = QLabel(title)
        title_label.setObjectName("OverviewStatLabel")

        value_label = QLabel(value)
        value_label.setObjectName("OverviewStatValue")

        meta_label = QLabel(meta)
        meta_label.setObjectName("OverviewStatMeta")
        meta_label.setWordWrap(True)

        card.value_label = value_label
        card.meta_label = meta_label

        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(meta_label)
        return card

    def refresh_summary(self):
        instances = self.get_instances()
        tasks = self.get_download_tasks()
        mods = self.count_installed_mods()

        self.summary_cards["instances"].value_label.setText(str(len(instances)))
        self.summary_cards["instances"].meta_label.setText("создай сборку" if not instances else "готово к запуску")

        self.summary_cards["mods"].value_label.setText(str(mods))
        self.summary_cards["mods"].meta_label.setText("во всех сборках")

        self.summary_cards["downloads"].value_label.setText(str(len(tasks)))
        active = len([task for task in tasks if str(task.get("state", "")).lower() == "active"])
        self.summary_cards["downloads"].meta_label.setText(f"активных: {active}")

        self.summary_cards["status"].value_label.setText("Готово")
        self.summary_cards["status"].meta_label.setText("лаунчер активен")

    # ---------- generic panel ----------
    def create_panel_shell(self, title, text=None, action_text=None, callback=None):
        panel = QFrame()
        panel.setObjectName("DashboardPanel")
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(10)

        head = QHBoxLayout()
        head.setSpacing(10)

        title_label = QLabel(title)
        title_label.setObjectName("PanelTitle")
        head.addWidget(title_label)
        head.addStretch()

        if action_text and callback:
            action_btn = QPushButton(action_text)
            action_btn.setObjectName("SmallGhostButton")
            action_btn.clicked.connect(callback)
            head.addWidget(action_btn)

        layout.addLayout(head)

        if text:
            subtitle = QLabel(text)
            subtitle.setObjectName("PanelText")
            subtitle.setWordWrap(True)
            layout.addWidget(subtitle)

        panel.body_layout = layout
        return panel

    # ---------- instances panel ----------
    def create_instances_panel(self):
        self.instances_panel = self.create_panel_shell(
            "Последние сборки",
            "Главное под рукой: недавние сборки и быстрый переход к запуску или редактированию.",
            "Все сборки",
            lambda checked=False: self.navigate_requested.emit(1),
        )
        return self.instances_panel

    def rebuild_instances_panel(self):
        layout = self.instances_panel.body_layout
        while layout.count() > 2:
            item = layout.takeAt(2)
            widget = item.widget()
            if widget:
                widget.deleteLater()

        instances = sorted(
            self.get_instances(),
            key=lambda item: item.get("last_played_at") or item.get("created_at") or "",
            reverse=True,
        )

        if not instances:
            empty = QLabel("Сборок пока нет. Создай первую сборку и она появится здесь.")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(120)
            layout.addWidget(empty)
            return

        for instance in instances[:4]:
            layout.addWidget(self.create_instance_row(instance))

    def create_instance_row(self, instance):
        row = QFrame()
        row.setObjectName("InstanceDashboardRow")
        row.setMinimumHeight(58)
        box = QHBoxLayout(row)
        box.setContentsMargins(12, 10, 12, 10)
        box.setSpacing(12)

        icon_box = QLabel("▣")
        icon_box.setObjectName("BlockIcon")
        icon_box.setAlignment(Qt.AlignCenter)
        icon_box.setFixedSize(42, 42)
        icon_obj = qicon("nexus")
        if icon_obj:
            icon_box.setPixmap(icon_obj.pixmap(QSize(26, 26)))

        text = QVBoxLayout()
        text.setSpacing(2)

        title = QLabel(elide_text(instance.get("name", "Без названия"), 28))
        title.setObjectName("InstanceTitle")
        title.setToolTip(instance.get("name", ""))
        mod_count = len(load_json(Path(instance.get("path", "")) / "mods_index.json", {"mods": []}).get("mods", []))
        loader = instance.get("loader", "vanilla")
        loader_version = instance.get("loader_version")
        if loader_version and loader != "vanilla":
            loader = f"{loader} {loader_version}"
        meta = QLabel(
            f'{instance.get("minecraft_version", "unknown")} · {loader} · {mod_count} мод.'
        )
        meta.setObjectName("InstanceMeta")

        text.addWidget(title)
        text.addWidget(meta)

        details = QPushButton("Открыть")
        details.setObjectName("SmallGhostButton")
        details.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        box.addWidget(icon_box)
        box.addLayout(text)
        box.addStretch()
        box.addWidget(details)
        return row

    # ---------- quick start ----------
    def create_quick_start_panel(self):
        self.quick_start_panel = self.create_panel_shell(
            "Быстрый старт",
            "Основные действия разбиты на понятные шаги, чтобы пользователь не терялся.",
        )
        return self.quick_start_panel

    def rebuild_quick_start_panel(self):
        layout = self.quick_start_panel.body_layout
        while layout.count() > 2:
            item = layout.takeAt(2)
            widget = item.widget()
            if widget:
                widget.deleteLater()

        items = [
            ("01", "Создать сборку", "Выбери версию Minecraft и загрузчик.", lambda checked=False: self.create_instance_requested.emit()),
            ("02", "Открыть каталог", "Найди моды, шейдеры и ресурспаки.", lambda checked=False: self.navigate_requested.emit(2)),
            ("03", "Проверить настройки", "Настрой RAM, Java и тему.", lambda checked=False: self.navigate_requested.emit(6)),
            ("04", "Запустить игру", "Используй вкладку «Сборки» для старта.", lambda checked=False: self.navigate_requested.emit(1)),
        ]

        for num, title, desc, callback in items:
            layout.addWidget(self.create_step_row(num, title, desc, callback))

    def create_step_row(self, number, title, desc, callback):
        row = QFrame()
        row.setObjectName("RecommendationRow")
        box = QHBoxLayout(row)
        box.setContentsMargins(12, 10, 12, 10)
        box.setSpacing(12)

        num_label = QLabel(number)
        num_label.setObjectName("SmallBadge")
        num_label.setAlignment(Qt.AlignCenter)
        num_label.setFixedWidth(42)

        text = QVBoxLayout()
        text.setSpacing(2)
        title_label = QLabel(title)
        title_label.setObjectName("CardTitle")
        desc_label = QLabel(desc)
        desc_label.setObjectName("QuickActionText")
        desc_label.setWordWrap(True)
        text.addWidget(title_label)
        text.addWidget(desc_label)

        button = QPushButton("Перейти")
        button.setObjectName("SmallGhostButton")
        button.clicked.connect(callback)

        box.addWidget(num_label)
        box.addLayout(text, 1)
        box.addWidget(button)
        return row

    # ---------- activity ----------
    def create_activity_panel(self):
        self.activity_panel = self.create_panel_shell(
            "Недавние действия",
            "Последние загрузки и операции, чтобы быстро понимать, что происходило в лаунчере.",
            "Загрузки",
            lambda checked=False: self.navigate_requested.emit(4),
        )
        return self.activity_panel

    def rebuild_activity_panel(self):
        layout = self.activity_panel.body_layout
        while layout.count() > 2:
            item = layout.takeAt(2)
            widget = item.widget()
            if widget:
                widget.deleteLater()

        tasks = self.get_download_tasks()[:4]
        if not tasks:
            empty = QLabel("История загрузок пока пуста.")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(120)
            layout.addWidget(empty)
            return

        for task in tasks:
            layout.addWidget(self.create_activity_row(task))

    def create_activity_row(self, task):
        row = QFrame()
        row.setObjectName("ActivityRow")
        box = QHBoxLayout(row)
        box.setContentsMargins(12, 10, 12, 10)
        box.setSpacing(12)

        label = QLabel("◆")
        label.setObjectName("OverviewIcon")
        label.setAlignment(Qt.AlignCenter)
        label.setFixedSize(32, 32)

        text = QVBoxLayout()
        text.setSpacing(2)
        title = QLabel(task.get("title", "Операция"))
        title.setObjectName("CardTitle")
        meta = QLabel(f'{task.get("status", "Готово")} • {int(task.get("progress") or 0)}%')
        meta.setObjectName("ActivityMeta")
        text.addWidget(title)
        text.addWidget(meta)

        badge = QLabel((task.get("state") or "done").upper())
        badge.setObjectName("SmallBadge")

        box.addWidget(label)
        box.addLayout(text)
        box.addStretch()
        box.addWidget(badge)
        return row

    # ---------- system panel ----------
    def create_system_panel(self):
        self.system_panel = self.create_panel_shell(
            "Система и лаунчер",
            "Важные технические параметры собраны в одном спокойном блоке.",
            "Настройки",
            lambda checked=False: self.navigate_requested.emit(6),
        )

        layout = self.system_panel.body_layout

        grid = QGridLayout()
        grid.setHorizontalSpacing(10)
        grid.setVerticalSpacing(10)

        self.system_cards = {
            "ram": self.create_system_card("RAM", "—", 0),
            "available": self.create_system_card("Свободно", "—", 0),
            "minecraft_ram": self.create_system_card("Minecraft RAM", "—", 0),
            "java": self.create_system_card("Java", "Eclipse Temurin", 100),
        }

        keys = ["ram", "available", "minecraft_ram", "java"]
        for idx, key in enumerate(keys):
            grid.addWidget(self.system_cards[key], idx // 2, idx % 2)

        layout.addLayout(grid)
        return self.system_panel

    def create_system_card(self, title, value, progress):
        card = QFrame()
        card.setObjectName("HeroStatCard")
        vbox = QVBoxLayout(card)
        vbox.setContentsMargins(12, 10, 12, 10)
        vbox.setSpacing(6)

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")

        value_label = QLabel(value)
        value_label.setObjectName("HeroStatValue")

        bar = QProgressBar()
        bar.setObjectName("MiniProgress")
        bar.setRange(0, 100)
        bar.setValue(progress)
        bar.setTextVisible(False)
        bar.setFixedHeight(5)

        card.value_label = value_label
        card.progress_bar = bar

        vbox.addWidget(title_label)
        vbox.addWidget(value_label)
        vbox.addWidget(bar)
        return card

    def refresh_system_info(self):
        if not get_pc_summary:
            return

        try:
            pc = get_pc_summary()
            total_text = pc.get("hero_ram_text", "—")
            available_text = pc.get("available_ram_text", "—")
            total_mb = int(pc.get("total_ram_mb", 0) or 0)
            available_mb = int(pc.get("available_ram_mb", 0) or 0)
            memory_percent = int(pc.get("memory_load_percent", 0) or 0)

            self.system_cards["ram"].value_label.setText(total_text)
            self.system_cards["ram"].progress_bar.setValue(memory_percent)

            self.system_cards["available"].value_label.setText(available_text)
            if total_mb > 0:
                self.system_cards["available"].progress_bar.setValue(int((available_mb / total_mb) * 100))

            if self.settings:
                mc_ram = self.settings.get_ram_mb()
                self.system_cards["minecraft_ram"].value_label.setText(format_ram_mb(mc_ram))
                if total_mb > 0:
                    self.system_cards["minecraft_ram"].progress_bar.setValue(int((int(mc_ram) / total_mb) * 100))
            else:
                self.system_cards["minecraft_ram"].value_label.setText(pc.get("recommended_ram_text", "—"))

            self.system_cards["java"].value_label.setText("Eclipse Temurin")
            self.system_cards["java"].progress_bar.setValue(100)
        except Exception:
            pass
