from __future__ import annotations

from pathlib import Path

from storage.json_store import load_json


class CompatibilityAnalyzer:
    """Lightweight health checker for a Nexus instance.

    Поддерживает оба старых способа вызова:
    - CompatibilityAnalyzer(instance).analyze()
    - CompatibilityAnalyzer().analyze(instance)
    """

    def __init__(self, instance: dict | None = None):
        self.instance = instance or {}
        self.issues: list[str] = []
        self.warnings: list[str] = []
        self.success: list[str] = []

    def analyze(self, instance: dict | None = None):
        if instance is not None:
            self.instance = instance or {}

        self.issues = []
        self.warnings = []
        self.success = []

        self.check_identity()
        self.check_loader()
        self.check_ram()
        self.check_dirs()
        self.check_mod_index()
        self.check_orphan_files()
        self.check_duplicate_filenames()
        self.check_recommendations()

        return {
            "score": self.calculate_score(),
            "status": self.get_status(),
            "issues": self.issues,
            "warnings": self.warnings,
            "success": self.success,
        }

    def minecraft_dir(self) -> Path:
        if self.instance.get("minecraft_dir"):
            return Path(self.instance["minecraft_dir"])
        return Path(self.instance.get("path", "")) / ".minecraft"

    def instance_path(self) -> Path:
        return Path(self.instance.get("path", ""))

    def mods_dir(self) -> Path:
        return self.minecraft_dir() / "mods"

    def index_path(self) -> Path:
        return self.instance_path() / "mods_index.json"

    def index_data(self) -> dict:
        return load_json(self.index_path(), {"mods": []})

    def indexed_mods(self) -> list[dict]:
        data = self.index_data()
        mods = data.get("mods", [])
        return mods if isinstance(mods, list) else []

    def check_identity(self):
        if not self.instance.get("name"):
            self.warnings.append("У сборки нет названия.")

        if not self.instance.get("minecraft_version"):
            self.issues.append("У сборки не указана версия Minecraft.")
        else:
            self.success.append(f"Minecraft: {self.instance.get('minecraft_version')}")

    def check_loader(self):
        loader = str(self.instance.get("loader") or "vanilla").lower()

        if loader == "vanilla":
            if self.indexed_mods() or list(self.mods_dir().glob("*.jar")):
                self.issues.append("В Vanilla-сборке есть .jar-моды. Minecraft их не загрузит без Fabric/Forge/NeoForge/Quilt.")
            else:
                self.warnings.append("Сборка Vanilla. Для модов нужен Fabric/Forge/NeoForge/Quilt.")
        else:
            self.success.append(f"Loader выбран: {loader}")

    def check_ram(self):
        ram = self.instance.get("ram_mb") or self.instance.get("ram") or 2048

        try:
            ram = int(ram)
        except Exception:
            self.warnings.append("RAM указана некорректно.")
            return

        if ram < 2048:
            self.issues.append("Слишком мало RAM. Рекомендуется минимум 2 GB.")
        elif ram < 4096:
            self.warnings.append("Для модов лучше поставить 4 GB RAM или больше.")
        else:
            self.success.append(f"RAM достаточно: {ram} MB")

    def check_dirs(self):
        instance_path = self.instance_path()
        minecraft_dir = self.minecraft_dir()
        mods_dir = self.mods_dir()

        if not instance_path:
            self.issues.append("Не указан путь сборки.")
            return

        if not instance_path.exists():
            self.issues.append(f"Папка сборки не найдена: {instance_path}")
        else:
            self.success.append("Папка сборки существует.")

        if not minecraft_dir.exists():
            self.warnings.append("Папка .minecraft ещё не создана. Она появится после установки/запуска.")
        else:
            self.success.append("Папка .minecraft существует.")

        if not mods_dir.exists() and str(self.instance.get("loader") or "vanilla").lower() != "vanilla":
            self.warnings.append("Папка mods ещё не создана.")

    def check_mod_index(self):
        indexed = self.indexed_mods()
        if not indexed:
            self.warnings.append("В индексе Nexus пока нет установленных проектов.")
            return

        current_mc = str(self.instance.get("minecraft_version") or "")
        current_loader = str(self.instance.get("loader") or "").lower()

        missing_files = 0
        mismatched = 0

        for mod in indexed:
            files = mod.get("files") or []
            if not files or not any(Path(path).exists() for path in files):
                missing_files += 1

            mod_mc = str(mod.get("minecraft_version") or "")
            mod_loader = str(mod.get("loader") or "").lower()

            if mod_mc and current_mc and mod_mc != current_mc:
                mismatched += 1

            if mod_loader and current_loader and mod_loader != current_loader and mod.get("project_type") == "mod":
                mismatched += 1

        if missing_files:
            self.issues.append(f"В индексе есть проекты с потерянными файлами: {missing_files}.")
        else:
            self.success.append("Все индексированные файлы на месте.")

        if mismatched:
            self.warnings.append(f"Есть записи, установленные под другую версию/loader: {mismatched}.")
        else:
            self.success.append("Индекс модов соответствует текущей сборке.")

    def check_orphan_files(self):
        mods_dir = self.mods_dir()
        if not mods_dir.exists():
            return

        indexed_files = set()
        for mod in self.indexed_mods():
            for item in mod.get("files", []):
                indexed_files.add(str(Path(item).resolve()).lower())

        jars = sorted(mods_dir.glob("*.jar"))
        orphaned = [
            path for path in jars
            if str(path.resolve()).lower() not in indexed_files
        ]

        if orphaned:
            self.warnings.append(f"Есть .jar-файлы не из индекса Nexus: {len(orphaned)}.")
        elif jars:
            self.success.append("Все .jar-файлы связаны с индексом Nexus.")

    def check_duplicate_filenames(self):
        mods_dir = self.mods_dir()
        if not mods_dir.exists():
            return

        names = {}
        for path in mods_dir.glob("*.jar"):
            key = path.name.lower()
            names.setdefault(key, 0)
            names[key] += 1

        duplicates = [name for name, count in names.items() if count > 1]
        if duplicates:
            self.issues.append(f"Найдены дубли .jar-файлов: {len(duplicates)}.")

    def check_recommendations(self):
        loader = str(self.instance.get("loader") or "vanilla").lower()
        indexed = self.indexed_mods()
        titles = " ".join(str(mod.get("title") or mod.get("slug") or "").lower() for mod in indexed)

        if loader == "fabric" and indexed:
            if "fabric api" not in titles and "fabric-api" not in titles:
                self.warnings.append("Для многих Fabric-модов нужен Fabric API. Стоит установить его, если моды не запускаются.")

        if len(indexed) >= 20:
            self.warnings.append("Модов уже много. После обновлений лучше делать резервную копию сборки.")

    def calculate_score(self):
        score = 100
        score -= len(self.issues) * 18
        score -= len(self.warnings) * 7
        return max(0, min(100, score))

    def get_status(self):
        score = self.calculate_score()
        if score >= 90:
            return "Excellent"
        if score >= 75:
            return "Normal"
        if score >= 50:
            return "Risks"
        return "Problematic"
