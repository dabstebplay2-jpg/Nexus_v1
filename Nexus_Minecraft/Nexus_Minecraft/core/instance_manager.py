import re
import uuid
import shutil
import logging
import threading
from datetime import datetime
from pathlib import Path

from storage.paths import INSTANCES_DIR, INSTANCES_FILE, ensure_project_dirs
from storage.json_store import load_json, save_json


logger = logging.getLogger(__name__)

_manager_instance = None
_manager_lock = threading.Lock()


def get_instance_manager():
    global _manager_instance

    if _manager_instance is None:
        with _manager_lock:
            if _manager_instance is None:
                _manager_instance = InstanceManager()

    return _manager_instance


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-zа-я0-9]+", "-", text)
    text = text.strip("-")
    return text or "instance"


INVALID_NAME_CHARS = set('\\/:*?"<>|')


def validate_instance_name(name: str) -> str | None:
    if not name or not name.strip():
        return "Имя сборки не может быть пустым."
    name = name.strip()
    if any(c in INVALID_NAME_CHARS for c in name):
        return "Имя содержит недопустимые символы (\\ / : * ? \" < > |)."
    if len(name) > 100:
        return "Имя слишком длинное (макс. 100 символов)."
    return None


class InstanceManager:
    def __init__(self):
        self._lock = threading.RLock()
        ensure_project_dirs()
        self.reload()

    def reload(self):
        with self._lock:
            self.data = load_json(INSTANCES_FILE, {"instances": []})
            return self.data

    def get_instances(self):
        with self._lock:
            return list(self.data.get("instances", []))

    def get_instance(self, instance_id: str):
        with self._lock:
            for instance in self.data.get("instances", []):
                if instance.get("id") == instance_id:
                    return dict(instance)
            return None

    def save(self):
        with self._lock:
            save_json(INSTANCES_FILE, self.data)

    def create_instance(
        self,
        name: str,
        minecraft_version: str,
        loader: str = "vanilla",
        ram_mb: int = 4096,
        loader_version: str | None = None,
    ):
        error = validate_instance_name(name)
        if error:
            raise ValueError(error)

        instance_id = str(uuid.uuid4())
        folder_name = slugify(name)

        instance_path = INSTANCES_DIR / folder_name

        counter = 2
        while instance_path.exists():
            instance_path = INSTANCES_DIR / f"{folder_name}-{counter}"
            counter += 1

        minecraft_dir = instance_path / ".minecraft"
        mods_dir = minecraft_dir / "mods"

        mods_dir.mkdir(parents=True, exist_ok=True)

        instance = {
            "id": instance_id,
            "name": name,
            "minecraft_version": minecraft_version,
            "loader": loader,
            "loader_version": loader_version,
            "ram_mb": ram_mb,
            "path": str(instance_path),
            "minecraft_dir": str(minecraft_dir),
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "last_played_at": None,
        }

        save_json(instance_path / "instance.json", instance)

        with self._lock:
            self.data.setdefault("instances", [])
            self.data["instances"].append(instance)
            self.save()

        return instance

    def update_instance(self, instance_id: str, updates: dict):
        with self._lock:
            for instance in self.data.get("instances", []):
                if instance.get("id") == instance_id:
                    instance.update(updates)
                    instance_path = Path(instance["path"])
                    save_json(instance_path / "instance.json", instance)
                    self.save()
                    return dict(instance)

        raise RuntimeError("Сборка не найдена.")

    def mark_played(self, instance_id: str):
        return self.update_instance(
            instance_id,
            {"last_played_at": datetime.now().isoformat(timespec="seconds")},
        )

    def delete_instance(self, instance_id: str, delete_files: bool = True):
        with self._lock:
            instance = None
            for item in self.data.get("instances", []):
                if item.get("id") == instance_id:
                    instance = dict(item)
                    break

            if not instance:
                raise RuntimeError("Сборка не найдена.")

            instance_path = Path(instance["path"])

            self.data["instances"] = [
                item for item in self.data.get("instances", [])
                if item.get("id") != instance_id
            ]

            self.save()

        if delete_files and instance_path.exists():
            shutil.rmtree(instance_path)

        return instance

    def export_instance(self, instance_id: str, export_path: str | Path, include_cache: bool = False):
        instance = self.get_instance(instance_id)
        if not instance:
            raise RuntimeError("Сборка не найдена.")

        instance_path = Path(instance["path"])
        if not instance_path.exists():
            raise RuntimeError(f"Папка сборки не найдена: {instance_path}")

        import zipfile

        export_path = Path(export_path)
        export_path.parent.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(export_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for file_path in instance_path.rglob("*"):
                if file_path.is_file():
                    if not include_cache and any(
                        part.startswith(".") or part == "cache" or part == "logs"
                        for part in file_path.relative_to(instance_path).parts
                    ):
                        continue
                    arcname = str(file_path.relative_to(instance_path))
                    zf.write(file_path, arcname)

        return str(export_path)

    def import_instance(self, import_path: str | Path) -> dict:
        import zipfile

        import_path = Path(import_path)
        if not import_path.exists():
            raise RuntimeError(f"Файл импорта не найден: {import_path}")

        instance_json_path = None
        temp_dir = None

        try:
            import tempfile
            temp_dir = Path(tempfile.mkdtemp(prefix="nexus_import_"))

            with zipfile.ZipFile(import_path, "r") as zf:
                for member in zf.infolist():
                    member_path = Path(member.filename)
                    if member_path.is_absolute() or ".." in member_path.parts:
                        raise RuntimeError(f"Обнаружен небезопасный путь в архиве: {member.filename}")
                    zf.extract(member, temp_dir)

            for f in temp_dir.rglob("instance.json"):
                instance_json_path = f
                break

            if not instance_json_path:
                raise RuntimeError("В архиве не найден instance.json.")

            instance_data = load_json(instance_json_path, {})
            name = instance_data.get("name") or instance_data.get("id", "Imported")
            mc_version = instance_data.get("minecraft_version", "")
            loader = instance_data.get("loader", "vanilla")
            loader_version = instance_data.get("loader_version")
            ram_mb = instance_data.get("ram_mb", 4096)

            if not mc_version:
                raise RuntimeError("В импортируемой сборке не указана версия Minecraft.")

            imported_path = instance_json_path.parent
            new_instance_id = str(uuid.uuid4())
            folder_name = slugify(name)

            new_instance_path = INSTANCES_DIR / folder_name
            counter = 2
            while new_instance_path.exists():
                new_instance_path = INSTANCES_DIR / f"{folder_name}-{counter}"
                counter += 1

            shutil.copytree(imported_path, new_instance_path)
            new_minecraft_dir = new_instance_path / ".minecraft"

            instance = {
                "id": new_instance_id,
                "name": name,
                "minecraft_version": mc_version,
                "loader": loader,
                "loader_version": loader_version,
                "ram_mb": ram_mb,
                "path": str(new_instance_path),
                "minecraft_dir": str(new_minecraft_dir),
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "last_played_at": None,
            }

            save_json(new_instance_path / "instance.json", instance)

            with self._lock:
                self.data.setdefault("instances", [])
                self.data["instances"].append(instance)
                self.save()

            return instance

        finally:
            if temp_dir and temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)