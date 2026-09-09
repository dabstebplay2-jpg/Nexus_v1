from pathlib import Path

from PySide6.QtCore import Signal, Qt, QSize, QTimer
from PySide6.QtGui import QColor, QPainter
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

from ui.utils.helpers import clear_layout

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
        gb = int(mb) / 1024
        if abs(gb - round(gb)) < 0.05:
            return f"{int(round(gb))} GB"
        return f"{gb:.1f} GB"
    except Exception:
        return "—"


class MinecraftHero(QFrame):
    def __init__(self):
        super().__init__()
        self.setObjectName("MinecraftHero")
        self.setMinimumHeight(210)

    def paintEvent(self, event):
        super().paintEvent(event)

        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing, False)

        w = self.width()
        h = self.height()

        for i in range(24):
            x = (i * 67) % max(w, 1)
            y = 24 + ((i * 19) % 80)
            painter.fillRect(x, y, 42, 12, QColor(90, 111, 145, 70))

        for i in range(54):
            x = (i * 31) % max(w, 1)
            base = h - 70 - ((i * 17) % 42)

            painter.fillRect(x + 8, base + 20, 8, 38, QColor(72, 45, 24, 100))
            painter.fillRect(x, base, 30, 28, QColor(22, 101, 52, 125))
            painter.fillRect(x + 5, base - 16, 22, 22, QColor(34, 197, 94, 95))

        block = 18
        top = h - 54

        colors = [
            QColor(22, 101, 52, 130),
            QColor(34, 197, 94, 90),
            QColor(75, 50, 28, 100),
            QColor(20, 83, 45, 150),
        ]

        for row in range(4):
            for col in range((w // block) + 2):
                x = col * block
                y = top + row * block + ((col + row) % 2) * 3
                painter.fillRect(x, y, block, block, colors[(row + col) % len(colors)])

        painter.fillRect(0, 0, w, h, QColor(2, 6, 23, 105))


class HomePage(QWidget):
    navigate_requested = Signal(int)
    create_instance_requested = Signal()

    def __init__(self):
        super().__init__()

        self.instance_manager = get_instance_manager()
        self.download_manager = DownloadManager() if DownloadManager else None
        self.stat_value_labels = {}
        self.overview_cards = {}
        self.settings = get_launcher_settings() if get_launcher_settings else None

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        self.scroll = QScrollArea()
        self.scroll.setObjectName("ScrollArea")
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self.content = QWidget()
        root = QVBoxLayout(self.content)
        root.setContentsMargins(24, 20, 24, 20)
        root.setSpacing(14)

        self.scroll.setWidget(self.content)
        outer.addWidget(self.scroll)

        root.addWidget(self.create_hero())
        root.addLayout(self.create_overview_strip())

        middle = QHBoxLayout()
        middle.setSpacing(14)
        middle.addWidget(self.create_instances_panel(), 5)
        middle.addWidget(self.create_quick_actions_panel(), 4)
        root.addLayout(middle)

        bottom = QHBoxLayout()
        bottom.setSpacing(14)
        bottom.addWidget(self.create_activity_panel(), 5)
        bottom.addWidget(self.create_recommendations_panel(), 4)
        root.addLayout(bottom)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh_pc_stats)
        self.timer.start(1800)

        self.refresh()

    def refresh(self):
        self.rebuild_instances_panel()
        self.rebuild_activity_panel()
        self.rebuild_recommendations_panel()
        self.refresh_pc_stats()
        self.refresh_overview()
        self.refresh_active_instance_info()

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

    def create_hero(self):
        hero = MinecraftHero()

        layout = QVBoxLayout(hero)
        layout.setContentsMargins(22, 18, 22, 18)
        layout.setSpacing(12)

        top = QHBoxLayout()
        top.setSpacing(18)

        text = QVBoxLayout()
        text.setSpacing(6)

        welcome = QLabel("Добро пожаловать в")
        welcome.setObjectName("HeroWelcome")

        title = QLabel('Nexus <span style="color:#22C55E;">Launcher</span>')
        title.setObjectName("HeroTitle")
        title.setTextFormat(Qt.RichText)

        subtitle = QLabel(
            "Современный лаунчер для сборок, модов, аккаунтов и полной экосистемы Minecraft."
        )
        subtitle.setObjectName("HeroSubtitle")
        subtitle.setWordWrap(True)

        self.active_instance_title = QLabel("Активная сборка: пока нет")
        self.active_instance_title.setObjectName("StatusBadge")

        text.addWidget(welcome)
        text.addWidget(title)
        text.addWidget(subtitle)
        text.addSpacing(4)
        text.addWidget(self.active_instance_title, 0, Qt.AlignLeft)

        actions = QHBoxLayout()
        actions.setSpacing(12)

        play = QPushButton("Открыть сборки")
        play.setObjectName("HeroPlayButton")
        play_icon = qicon("play")
        if play_icon:
            play.setIcon(play_icon)
            play.setIconSize(QSize(18, 18))
        play.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        mods_button = QPushButton("Искать моды")
        mods_button.setObjectName("SecondaryButton")
        mods_icon = qicon("mods")
        if mods_icon:
            mods_button.setIcon(mods_icon)
            mods_button.setIconSize(QSize(18, 18))
        mods_button.clicked.connect(lambda checked=False: self.navigate_requested.emit(2))

        create_button = QPushButton("Новая сборка")
        create_button.setObjectName("SecondaryButton")
        plus_icon = qicon("plus")
        if plus_icon:
            create_button.setIcon(plus_icon)
            create_button.setIconSize(QSize(18, 18))
        create_button.clicked.connect(lambda checked=False: self.create_instance_requested.emit())

        actions.addWidget(play)
        actions.addWidget(mods_button)
        actions.addWidget(create_button)
        actions.addStretch()

        text.addSpacing(6)
        text.addLayout(actions)

        top.addLayout(text, 1)

        stats = QGridLayout()
        stats.setHorizontalSpacing(10)
        stats.setVerticalSpacing(10)

        self.ram_card = self.create_hero_stat("ram", "Оперативная память", "—", 0, "ram")
        self.available_card = self.create_hero_stat("ram", "Доступно", "—", 0, "available")
        self.minecraft_ram_card = self.create_hero_stat("loader", "RAM для Minecraft", "—", 100, "minecraft_ram")
        self.java_card = self.create_hero_stat("java", "Java", "Проверка...", 100, "java")

        stats.addWidget(self.ram_card, 0, 0)
        stats.addWidget(self.available_card, 0, 1)
        stats.addWidget(self.minecraft_ram_card, 1, 0)
        stats.addWidget(self.java_card, 1, 1)

        top.addLayout(stats)
        layout.addLayout(top)

        return hero

    def create_hero_stat(self, icon_name, title, value, progress, key):
        card = QFrame()
        card.setObjectName("HeroStatCard")
        card.setMinimumHeight(62)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(7)

        row = QHBoxLayout()

        icon_label = QLabel("◆")
        icon_label.setObjectName("HeroStatIcon")

        icon_obj = qicon(icon_name)
        if icon_obj:
            icon_label.setPixmap(icon_obj.pixmap(QSize(20, 20)))

        title_label = QLabel(title)
        title_label.setObjectName("HeroStatTitle")

        row.addWidget(icon_label)
        row.addWidget(title_label)
        row.addStretch()

        value_label = QLabel(value)
        value_label.setObjectName("HeroStatValue")
        self.stat_value_labels[key] = value_label

        bar = QProgressBar()
        bar.setObjectName("MiniProgress")
        bar.setRange(0, 100)
        bar.setValue(progress)
        bar.setTextVisible(False)
        bar.setFixedHeight(5)
        card.progress_bar = bar

        layout.addLayout(row)
        layout.addWidget(value_label)
        layout.addWidget(bar)

        return card

    def create_overview_strip(self):
        strip = QHBoxLayout()
        strip.setSpacing(14)

        self.overview_cards["instances"] = self.create_overview_card("instances", "Сборки", "0", "готовы к запуску")
        self.overview_cards["mods"] = self.create_overview_card("mods", "Установлено модов", "0", "во всех сборках")
        self.overview_cards["downloads"] = self.create_overview_card("downloads", "История загрузок", "0", "задач в центре")
        self.overview_cards["last"] = self.create_overview_card("rocket", "Последняя активность", "—", "последний запуск")

        for key in ["instances", "mods", "downloads", "last"]:
            strip.addWidget(self.overview_cards[key])

        return strip

    def create_overview_card(self, icon_name, label, value, meta):
        card = QFrame()
        card.setObjectName("OverviewStatCard")
        card.setMinimumHeight(88)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)

        top = QHBoxLayout()
        icon_label = QLabel("◆")
        icon_label.setObjectName("OverviewIcon")
        icon_label.setAlignment(Qt.AlignCenter)
        icon_label.setFixedSize(32, 32)
        icon_obj = qicon(icon_name)
        if icon_obj:
            icon_label.setPixmap(icon_obj.pixmap(QSize(18, 18)))

        label_widget = QLabel(label)
        label_widget.setObjectName("OverviewStatLabel")
        top.addWidget(icon_label)
        top.addSpacing(8)
        top.addWidget(label_widget)
        top.addStretch()

        value_label = QLabel(value)
        value_label.setObjectName("OverviewStatValue")
        meta_label = QLabel(meta)
        meta_label.setObjectName("OverviewStatMeta")

        card.value_label = value_label
        card.meta_label = meta_label

        layout.addLayout(top)
        layout.addWidget(value_label)
        layout.addWidget(meta_label)
        return card

    def refresh_overview(self):
        instances = self.get_instances()
        mod_count = self.count_installed_mods()
        tasks = self.get_download_tasks()
        latest = self.get_last_instance()

        self.overview_cards["instances"].value_label.setText(str(len(instances)))
        self.overview_cards["instances"].meta_label.setText("готовы к запуску" if instances else "создай первую сборку")

        self.overview_cards["mods"].value_label.setText(str(mod_count))
        self.overview_cards["mods"].meta_label.setText("во всех сборках" if mod_count else "моды пока не установлены")

        self.overview_cards["downloads"].value_label.setText(str(len(tasks)))
        active_count = len([task for task in tasks if task.get("state") == "active"])
        self.overview_cards["downloads"].meta_label.setText(f"активных: {active_count}")

        if latest:
            loader = latest.get("loader", "vanilla")
            self.overview_cards["last"].value_label.setText(latest.get("name", "Без названия"))
            self.overview_cards["last"].meta_label.setText(f'{latest.get("minecraft_version", "unknown")} • {loader}')
        else:
            self.overview_cards["last"].value_label.setText("—")
            self.overview_cards["last"].meta_label.setText("последний запуск")

    def refresh_active_instance_info(self):
        latest = self.get_last_instance()
        if latest:
            mod_count = len(load_json(Path(latest.get("path", "")) / "mods_index.json", {"mods": []}).get("mods", []))
            self.active_instance_title.setText(
                f'Активная сборка: {latest.get("name", "Без названия")} • '
                f'{latest.get("minecraft_version", "unknown")} • {latest.get("loader", "vanilla")} • {mod_count} модов'
            )
        else:
            self.active_instance_title.setText("Активная сборка: создай первую сборку Nexus")

    def refresh_pc_stats(self):
        if not get_pc_summary:
            return

        try:
            pc = get_pc_summary()
            self.stat_value_labels["ram"].setText(pc.get("hero_ram_text", "—"))
            self.stat_value_labels["available"].setText(pc.get("available_ram_text", "—"))

            if self.settings:
                self.stat_value_labels["minecraft_ram"].setText(format_ram_mb(self.settings.get_ram_mb()))
            else:
                self.stat_value_labels["minecraft_ram"].setText(pc.get("recommended_ram_text", "—"))

            self.stat_value_labels["java"].setText("Eclipse Temurin")

            self.ram_card.progress_bar.setValue(int(pc.get("memory_load_percent", 0)))
            total = int(pc.get("total_ram_mb", 0))
            available = int(pc.get("available_ram_mb", 0))
            if total > 0:
                self.available_card.progress_bar.setValue(int((available / total) * 100))
                self.minecraft_ram_card.progress_bar.setValue(int((available / total) * 100))
        except Exception:
            pass

    def create_instances_panel(self):
        panel = QFrame()
        panel.setObjectName("DashboardPanel")

        self.instances_layout = QVBoxLayout(panel)
        self.instances_layout.setContentsMargins(16, 14, 16, 14)
        self.instances_layout.setSpacing(9)
        return panel

    def rebuild_instances_panel(self):
        if not hasattr(self, "instances_layout"):
            return

        clear_layout(self.instances_layout)

        top = QHBoxLayout()
        title = QLabel("Мои сборки")
        title.setObjectName("PanelTitle")

        new_button = QPushButton("Новая сборка")
        new_button.setObjectName("SmallGhostButton")
        plus_icon = qicon("plus")
        if plus_icon:
            new_button.setIcon(plus_icon)
            new_button.setIconSize(QSize(16, 16))
        new_button.clicked.connect(lambda checked=False: self.create_instance_requested.emit())

        top.addWidget(title)
        top.addStretch()
        top.addWidget(new_button)
        self.instances_layout.addLayout(top)

        info = QLabel("Запускай, открывай детали и держи под рукой последние сборки.")
        info.setObjectName("PanelText")
        self.instances_layout.addWidget(info)

        instances = self.get_instances()
        if not instances:
            empty = QLabel("Сборок пока нет. Нажми «Новая сборка».")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(72)
            self.instances_layout.addWidget(empty)
        else:
            sorted_instances = sorted(
                instances,
                key=lambda item: item.get("last_played_at") or item.get("created_at") or "",
                reverse=True,
            )
            for index, instance in enumerate(sorted_instances[:5]):
                self.instances_layout.addWidget(self.create_instance_row(instance, index))

        show_all = QPushButton(f"Показать все сборки ({len(instances)})")
        show_all.setObjectName("WideGhostButton")
        show_all.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        if instances:
            self.instances_layout.addStretch()
        self.instances_layout.addWidget(show_all)

    def create_instance_row(self, instance, index):
        row = QFrame()
        row.setObjectName("InstanceDashboardRowActive" if index == 0 else "InstanceDashboardRow")

        layout = QHBoxLayout(row)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(12)

        block = QLabel("▣")
        block.setObjectName("BlockIcon")
        block.setAlignment(Qt.AlignCenter)
        block.setFixedSize(44, 44)
        icon_obj = qicon("instances")
        if icon_obj:
            block.setPixmap(icon_obj.pixmap(QSize(24, 24)))

        text = QVBoxLayout()
        text.setSpacing(2)

        name = QLabel(instance.get("name", "Без названия"))
        name.setObjectName("InstanceTitle")

        ram = instance.get("ram_mb") or instance.get("ram") or 4096
        mod_count = len(load_json(Path(instance.get("path", "")) / "mods_index.json", {"mods": []}).get("mods", []))
        meta = QLabel(
            f'{instance.get("minecraft_version", "unknown")} • {instance.get("loader", "vanilla")} • {ram} MB • {mod_count} модов'
        )
        meta.setObjectName("InstanceMeta")

        text.addWidget(name)
        text.addWidget(meta)

        open_button = QPushButton("Подробнее")
        open_button.setObjectName("SmallGhostButton")
        open_button.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        play = QPushButton()
        play.setObjectName("MiniPlayButton")
        play.setFixedSize(38, 38)
        play_icon = qicon("play")
        if play_icon:
            play.setIcon(play_icon)
            play.setIconSize(QSize(16, 16))
        else:
            play.setText("▶")
        play.clicked.connect(lambda checked=False: self.navigate_requested.emit(1))

        layout.addWidget(block)
        layout.addLayout(text)
        layout.addStretch()
        layout.addWidget(open_button)
        layout.addWidget(play)
        return row

    def create_quick_actions_panel(self):
        panel = QFrame()
        panel.setObjectName("DashboardPanel")

        self.quick_actions_layout = QVBoxLayout(panel)
        self.quick_actions_layout.setContentsMargins(16, 14, 16, 14)
        self.quick_actions_layout.setSpacing(9)

        title = QLabel("Быстрые действия")
        title.setObjectName("PanelTitle")
        subtitle = QLabel("Самые частые сценарии без лишних переходов.")
        subtitle.setObjectName("PanelText")

        self.quick_actions_layout.addWidget(title)
        self.quick_actions_layout.addWidget(subtitle)

        grid = QGridLayout()
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(12)

        actions = [
            ("plus", "Создать сборку", "Новая конфигурация Minecraft", lambda checked=False: self.create_instance_requested.emit()),
            ("mods", "Каталог модов", "Моды, шейдеры, ресурспаки", lambda checked=False: self.navigate_requested.emit(2)),
            ("library", "Библиотека", "Установленные проекты", lambda: self.navigate_requested.emit(3)),
            ("downloads", "Загрузки", "История и прогресс", lambda checked=False: self.navigate_requested.emit(4)),
            ("settings", "Настройки", "RAM, Java и тема", lambda: self.navigate_requested.emit(6)),
        ]

        for idx, (icon_name, title_text, desc_text, callback) in enumerate(actions):
            grid.addWidget(self.create_quick_action_card(icon_name, title_text, desc_text, callback), idx // 2, idx % 2)

        self.quick_actions_layout.addLayout(grid)
        self.quick_actions_layout.addStretch()
        return panel

    def create_quick_action_card(self, icon_name, title_text, desc_text, callback):
        card = QFrame()
        card.setObjectName("QuickActionCard")
        card.setCursor(Qt.PointingHandCursor)

        layout = QVBoxLayout(card)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(7)

        top = QHBoxLayout()
        icon_label = QLabel("◆")
        icon_label.setObjectName("QuickActionIcon")
        icon_label.setAlignment(Qt.AlignCenter)
        icon_label.setFixedSize(34, 34)
        icon_obj = qicon(icon_name)
        if icon_obj:
            icon_label.setPixmap(icon_obj.pixmap(QSize(18, 18)))

        title = QLabel(title_text)
        title.setObjectName("QuickActionTitle")

        desc = QLabel(desc_text)
        desc.setObjectName("QuickActionText")
        desc.setWordWrap(True)

        button = QPushButton("Открыть")
        button.setObjectName("SmallGhostButton")
        button.clicked.connect(callback)

        top.addWidget(icon_label)
        top.addWidget(title)
        top.addStretch()

        layout.addLayout(top)
        layout.addWidget(desc)
        layout.addStretch()
        layout.addWidget(button, 0, Qt.AlignLeft)
        return card

    def create_activity_panel(self):
        panel = QFrame()
        panel.setObjectName("DashboardPanel")
        self.activity_layout = QVBoxLayout(panel)
        self.activity_layout.setContentsMargins(20, 18, 20, 18)
        self.activity_layout.setSpacing(12)
        return panel

    def rebuild_activity_panel(self):
        if not hasattr(self, "activity_layout"):
            return
        clear_layout(self.activity_layout)

        top = QHBoxLayout()
        title = QLabel("Последняя активность")
        title.setObjectName("PanelTitle")
        button = QPushButton("Открыть загрузки")
        button.setObjectName("SmallGhostButton")
        button.clicked.connect(lambda checked=False: self.navigate_requested.emit(4))
        top.addWidget(title)
        top.addStretch()
        top.addWidget(button)

        text = QLabel("Недавние операции лаунчера: запуск, моды и системные задачи.")
        text.setObjectName("PanelText")

        self.activity_layout.addLayout(top)
        self.activity_layout.addWidget(text)

        tasks = self.get_download_tasks()[:4]
        if not tasks:
            empty = QLabel("История загрузок пока пуста.")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(150)
            self.activity_layout.addWidget(empty)
        else:
            for task in tasks:
                self.activity_layout.addWidget(self.create_activity_row(task))

        self.activity_layout.addStretch()

    def create_activity_row(self, task):
        row = QFrame()
        row.setObjectName("ActivityRow")
        layout = QHBoxLayout(row)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(12)

        icon_label = QLabel("◆")
        icon_label.setObjectName("OverviewIcon")
        icon_label.setAlignment(Qt.AlignCenter)
        icon_label.setFixedSize(34, 34)
        icon_obj = qicon(task.get("kind") if task.get("kind") in {"mods", "downloads", "library", "instances"} else "rocket")
        if icon_obj:
            icon_label.setPixmap(icon_obj.pixmap(QSize(16, 16)))

        text_block = QVBoxLayout()
        text_block.setSpacing(2)
        title = QLabel(task.get("title", "Операция"))
        title.setObjectName("CardTitle")
        meta = QLabel(f'{task.get("status", "Готово")} • {int(task.get("progress") or 0)}%')
        meta.setObjectName("ActivityMeta")
        text_block.addWidget(title)
        text_block.addWidget(meta)

        badge = QLabel((task.get("state") or "task").upper())
        badge.setObjectName("SmallBadge")

        layout.addWidget(icon_label)
        layout.addLayout(text_block)
        layout.addStretch()
        layout.addWidget(badge)
        return row

    def create_recommendations_panel(self):
        panel = QFrame()
        panel.setObjectName("DashboardPanel")
        self.recommendations_layout = QVBoxLayout(panel)
        self.recommendations_layout.setContentsMargins(20, 18, 20, 18)
        self.recommendations_layout.setSpacing(12)
        return panel

    def rebuild_recommendations_panel(self):
        if not hasattr(self, "recommendations_layout"):
            return
        clear_layout(self.recommendations_layout)

        title = QLabel("Что улучшить дальше")
        title.setObjectName("PanelTitle")
        text = QLabel("Небольшие подсказки, чтобы быстрее собрать идеальную Minecraft-конфигурацию.")
        text.setObjectName("PanelText")

        self.recommendations_layout.addWidget(title)
        self.recommendations_layout.addWidget(text)

        instances = self.get_instances()
        recommendations = []

        if not instances:
            recommendations.append(("Создай первую сборку", "Начни со вкладки «Сборки», выбери версию Minecraft и loader.", lambda checked=False: self.navigate_requested.emit(1)))
        else:
            if self.count_installed_mods() == 0:
                recommendations.append(("Установи базовые моды", "Добавь Fabric API, Sodium или Iris для первой сборки.", lambda checked=False: self.navigate_requested.emit(2)))
            recommendations.append(("Проверь библиотеку", "Посмотри все установленные моды по сборкам и быстро удали лишнее.", lambda: self.navigate_requested.emit(3)))
            recommendations.append(("Оптимизируй RAM", "Подбери оптимальную память для Minecraft в настройках.", lambda: self.navigate_requested.emit(6)))

        recommendations.append(("Открой аккаунты", "Настрой Offline, Microsoft или Ely.by профиль и подготовь скины.", lambda: self.navigate_requested.emit(5)))

        for title_text, desc_text, callback in recommendations[:4]:
            self.recommendations_layout.addWidget(self.create_recommendation_row(title_text, desc_text, callback))

        self.recommendations_layout.addStretch()

    def create_recommendation_row(self, title_text, desc_text, callback):
        row = QFrame()
        row.setObjectName("RecommendationRow")
        layout = QVBoxLayout(row)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)

        title = QLabel(title_text)
        title.setObjectName("CardTitle")
        text = QLabel(desc_text)
        text.setObjectName("QuickActionText")
        text.setWordWrap(True)

        button = QPushButton("Перейти")
        button.setObjectName("SmallGhostButton")
        button.clicked.connect(callback)

        layout.addWidget(title)
        layout.addWidget(text)
        layout.addWidget(button, 0, Qt.AlignLeft)
        return row
