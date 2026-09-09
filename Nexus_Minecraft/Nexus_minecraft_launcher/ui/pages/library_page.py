import logging
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
    QFrame,
)

from core.instance_manager import get_instance_manager
from storage.json_store import load_json, save_json
from ui.utils.helpers import clear_layout

logger = logging.getLogger(__name__)


class LibraryPage(QWidget):
    def __init__(self):
        super().__init__()
        self.instance_manager = get_instance_manager()

        root = QVBoxLayout(self)
        root.setContentsMargins(36, 32, 36, 32)
        root.setSpacing(18)

        title = QLabel("Библиотека")
        title.setObjectName("PageTitle")

        desc = QLabel("Все установленные проекты по сборкам: моды, ресурспаки и шейдеры. Быстрый просмотр, поиск и удаление.")
        desc.setObjectName("PageDescription")
        desc.setWordWrap(True)

        self.stats_row = QHBoxLayout()
        self.stats_row.setSpacing(14)
        self.total_mods_card = self.create_stat_card("Всего проектов", "0", "во всех сборках")
        self.instances_card = self.create_stat_card("Сборки", "0", "с проектами")
        self.filtered_card = self.create_stat_card("Показано", "0", "по текущему поиску")
        for card in [self.total_mods_card, self.instances_card, self.filtered_card]:
            self.stats_row.addWidget(card)

        search_layout = QHBoxLayout()
        self.search_input = QLineEdit()
        self.search_input.setObjectName("SearchInput")
        self.search_input.setPlaceholderText("Поиск по названию, slug, типу проекта или сборке...")
        self.search_input.textChanged.connect(self._on_search)
        search_layout.addWidget(self.search_input)

        self.stats_label = QLabel("")
        self.stats_label.setObjectName("InstanceMeta")

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setObjectName("ScrollArea")

        self.cards_container = QWidget()
        self.mods_layout = QVBoxLayout(self.cards_container)
        self.mods_layout.setSpacing(12)
        scroll.setWidget(self.cards_container)

        root.addWidget(title)
        root.addWidget(desc)
        root.addLayout(self.stats_row)
        root.addWidget(self.stats_label)
        root.addLayout(search_layout)
        root.addWidget(scroll)

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
        self._load_mods()

    def _on_search(self):
        self._load_mods()

    def _get_all_installed_mods(self):
        instances = self.instance_manager.get_instances()
        all_mods = []

        for instance in instances:
            index_path = Path(instance["path"]) / "mods_index.json"
            data = load_json(index_path, {"mods": []})

            for mod in data.get("mods", []):
                all_mods.append({
                    **mod,
                    "instance_id": instance["id"],
                    "instance_name": instance.get("name", "???"),
                    "instance_path": instance["path"],
                })

        all_mods.sort(key=lambda m: (m.get("title") or "").lower())
        return all_mods

    def _load_mods(self):
        clear_layout(self.mods_layout)

        all_mods = self._get_all_installed_mods()
        query = self.search_input.text().strip().lower()

        if query:
            filtered = [
                m for m in all_mods
                if query in (m.get("title") or "").lower()
                or query in (m.get("slug") or "").lower()
                or query in (m.get("project_type") or "").lower()
                or query in (m.get("instance_name") or "").lower()
            ]
        else:
            filtered = all_mods

        instance_names = {m.get("instance_name") for m in all_mods}
        self.total_mods_card.value_label.setText(str(len(all_mods)))
        self.instances_card.value_label.setText(str(len([name for name in instance_names if name])))
        self.filtered_card.value_label.setText(str(len(filtered)))

        by_type = {}
        for item in all_mods:
            key = item.get("project_type", "mod")
            by_type[key] = by_type.get(key, 0) + 1

        self.stats_label.setText(
            f"Всего проектов: {len(all_mods)}  •  Показано: {len(filtered)}  •  "
            f"Моды: {by_type.get('mod', 0)}  •  Ресурспаки: {by_type.get('resourcepack', 0)}  •  "
            f"Шейдеры: {by_type.get('shader', 0)}  •  Сборок: {len([name for name in instance_names if name])}"
        )

        if not filtered:
            empty = QLabel("Проекты не найдены." if query else "Пока нет установленных модов, ресурспаков или шейдеров.")
            empty.setObjectName("EmptyText")
            empty.setAlignment(Qt.AlignCenter)
            empty.setMinimumHeight(180)
            self.mods_layout.addWidget(empty)
            return

        for mod in filtered:
            card = self._create_mod_card(mod)
            self.mods_layout.addWidget(card)

        self.mods_layout.addStretch()

    def _create_mod_card(self, mod):
        card = QWidget()
        card.setObjectName("InstanceCard")
        card.setMinimumHeight(78)

        layout = QHBoxLayout(card)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(14)

        info = QVBoxLayout()
        info.setSpacing(4)

        title = QLabel(mod.get("title", "???"))
        title.setObjectName("InstanceTitle")

        project_type = mod.get('project_type', 'mod')
        type_label = {
            'mod': 'мод',
            'resourcepack': 'ресурспак',
            'shader': 'шейдер',
            'modpack': 'модпак',
        }.get(project_type, project_type)
        install_dir = mod.get('install_dir') or {
            'mod': 'mods',
            'resourcepack': 'resourcepacks',
            'shader': 'shaderpacks',
        }.get(project_type, 'mods')
        meta = QLabel(
            f"v{mod.get('version_number', '?')}  •  {type_label}  •  {install_dir}  •  {mod.get('instance_name', '???')}"
        )
        meta.setObjectName("InstanceMeta")

        slug = mod.get("slug") or mod.get("project_id") or "—"
        slug_label = QLabel(f"ID: {slug}")
        slug_label.setObjectName("InstanceMeta")

        info.addWidget(title)
        info.addWidget(meta)
        info.addWidget(slug_label)

        delete_btn = QPushButton("Удалить")
        delete_btn.setObjectName("DangerButton")
        delete_btn.setFixedWidth(120)
        delete_btn.clicked.connect(lambda checked=False, m=mod: self._delete_mod(m))

        layout.addLayout(info, 1)
        layout.addWidget(delete_btn)

        return card

    def _delete_mod(self, mod):
        files = mod.get("files", [])

        if not files:
            QMessageBox.information(self, "Информация", "Файлы мода не найдены (возможно, уже удалены).")
            return

        file_list = "\n".join(f"• {Path(f).name}" for f in files[:5])
        if len(files) > 5:
            file_list += f"\n• ... и ещё {len(files) - 5}"

        result = QMessageBox.question(
            self,
            "Удалить мод?",
            f'Удалить "{mod.get("title")}" из сборки "{mod.get("instance_name")}"?\n\nФайлы:\n{file_list}',
        )

        if result != QMessageBox.Yes:
            return

        from mods.mod_installer import ModInstaller
        installer = ModInstaller()

        deleted_any = False
        for file_path_str in files:
            file_path = Path(file_path_str)
            if file_path.exists():
                installer.delete_mod_file(file_path)
                deleted_any = True

        instance_path = Path(mod["instance_path"])
        index_path = instance_path / "mods_index.json"
        data = load_json(index_path, {"mods": []})
        data["mods"] = [
            item for item in data.get("mods", [])
            if item.get("project_id") != mod.get("project_id")
        ]
        save_json(index_path, data)

        if deleted_any:
            QMessageBox.information(self, "Готово", f'Мод "{mod.get("title")}" удалён.')
        else:
            QMessageBox.information(self, "Готово", "Запись о моде удалена (файлы не найдены на диске).")

        self._load_mods()
