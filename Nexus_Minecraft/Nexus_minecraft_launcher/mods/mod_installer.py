import hashlib
import logging
import time
import traceback
from pathlib import Path

import requests
from PySide6.QtCore import QThread, Signal

from core.constants import USER_AGENT
from core.download_manager import DownloadManager
from mods.modrinth_api import ModrinthAPI
from storage.json_store import load_json, save_json
from mods.mod_status import (
    find_installed_record,
    record_files_exist,
    load_mod_index,
    save_mod_index,
    record_matches_project,
)


logger = logging.getLogger(__name__)


class ModInstaller:
    SUPPORTED_TYPES = {"mod", "resourcepack", "shader"}
    MOD_FILE_EXTENSIONS = {".jar", ".litemod"}
    RESOURCE_FILE_EXTENSIONS = {".zip"}

    def __init__(self, progress_callback=None, status_callback=None, detail_callback=None, transfer_callback=None):
        self.api = ModrinthAPI()
        self.progress_callback = progress_callback or (lambda value: None)
        self.status_callback = status_callback or (lambda text: None)
        self.detail_callback = detail_callback or (lambda text: None)
        self.transfer_callback = transfer_callback or (lambda downloaded, total, speed: None)

    def get_install_dir(self, instance, project_type: str) -> Path:
        minecraft_dir = Path(instance["minecraft_dir"])
        project_type = (project_type or "mod").lower()

        if project_type == "resourcepack":
            return minecraft_dir / "resourcepacks"

        if project_type == "shader":
            return minecraft_dir / "shaderpacks"

        return minecraft_dir / "mods"

    def validate_instance_for_project_type(self, instance, project_type: str):
        project_type = (project_type or "mod").lower()
        minecraft_version = str(instance.get("minecraft_version") or "").strip()
        loader = str(instance.get("loader") or "vanilla").lower().strip()

        if not minecraft_version:
            raise RuntimeError("У сборки не указана версия Minecraft.")

        if project_type == "mod" and loader == "vanilla":
            raise RuntimeError(
                "Моды нельзя устанавливать в Vanilla-сборку.\n\n"
                "Что сделать:\n"
                "1. Создай новую сборку с Loader = fabric.\n"
                "2. Выбери Minecraft 1.20.1 или 1.21.x.\n"
                "3. После этого устанавливай моды в эту Fabric-сборку."
            )

    def version_is_compatible(self, version, instance, project_type="mod"):
        project_type = (project_type or "mod").lower()
        minecraft_version = str(instance.get("minecraft_version") or "").strip()
        loader = str(instance.get("loader") or "vanilla").lower().strip()

        game_versions = version.get("game_versions") or []
        loaders = [str(item).lower() for item in (version.get("loaders") or [])]

        if game_versions and minecraft_version not in game_versions:
            return False

        if project_type == "mod":
            if loader == "vanilla":
                return False
            if loaders and loader not in loaders:
                return False

        # Shader packs and resource packs are not loaded by Fabric/Forge directly.
        # Modrinth usually marks them with loaders like minecraft/iris/optifine/canvas.
        # We filter them primarily by Minecraft version and file type, then install
        # into shaderpacks/resourcepacks.
        if project_type in {"shader", "resourcepack"}:
            return True

        return True

    def build_incompatible_message(self, version, instance, project_type="mod"):
        return (
            "Найдена версия проекта, но она не подходит к выбранной сборке.\n\n"
            f"Версия проекта: {version.get('version_number') or version.get('name') or version.get('id')}\n"
            f"Minecraft сборки: {instance.get('minecraft_version')}\n"
            f"Loader сборки: {instance.get('loader', 'vanilla')}\n"
            f"Minecraft в файле: {', '.join(version.get('game_versions') or []) or 'не указано'}\n"
            f"Loaders в файле: {', '.join(version.get('loaders') or []) or 'не указано'}\n\n"
            "Выбери проект, который поддерживает именно эту версию Minecraft. "
            "Для .jar-модов также должен совпадать loader."
        )

    def validate_file_for_project_type(self, file_info, project_type="mod"):
        filename = file_info.get("filename") or ""
        suffix = Path(filename).suffix.lower()
        project_type = (project_type or "mod").lower()

        if project_type == "mod" and suffix not in self.MOD_FILE_EXTENSIONS:
            raise RuntimeError(
                f"Modrinth вернул файл «{filename}», но это не .jar/.litemod мод.\n"
                "Такой файл Minecraft loader не сможет загрузить как мод."
            )

        if project_type in {"resourcepack", "shader"} and suffix not in self.RESOURCE_FILE_EXTENSIONS:
            raise RuntimeError(
                f"Modrinth вернул файл «{filename}», но для этого типа ожидается .zip."
            )

    def install_project(self, project, instance, project_type: str = "mod"):
        project_type = (project_type or "mod").lower()

        if project_type == "modpack":
            raise RuntimeError(
                "Установка modpack (.mrpack) пока не поддерживается.\n\n"
                "Используй тип «mod», «resourcepack» или «shader»."
            )

        if project_type not in self.SUPPORTED_TYPES:
            raise RuntimeError(f"Неподдерживаемый тип проекта: {project_type}")

        self.validate_instance_for_project_type(instance, project_type)

        project_id = project.get("project_id") or project.get("slug") or project.get("id")
        title = project.get("title", project_id)

        if not project_id:
            raise RuntimeError("У проекта нет project_id/slug.")

        minecraft_version = instance["minecraft_version"]
        loader = str(instance.get("loader") or "vanilla").lower()

        existing_record = find_installed_record(instance, project, project_type)

        self.status_callback(f"Поиск совместимой версии: {title}")
        install_dir = self.get_install_dir(instance, project_type)
        self.detail_callback(f"Minecraft {minecraft_version} • {loader} • {project_type} • папка: {install_dir.name}")

        versions = self.api.get_project_versions(
            project_id_or_slug=project_id,
            minecraft_version=minecraft_version,
            loader=loader if project_type == "mod" else None,
        )

        if not versions:
            raise RuntimeError(
                f"Не найдена совместимая версия проекта.\n\n"
                f"Проект: {title}\n"
                f"Minecraft: {minecraft_version}\n"
                f"Loader: {loader}\n\n"
                "Nexus больше не будет скачивать случайную последнюю версию, "
                "потому что она может быть несовместимой и из-за этого моды «не работают»."
            )

        selected_version = self.pick_best_version(versions)

        if existing_record and record_files_exist(existing_record):
            existing_version_id = existing_record.get("version_id")
            if existing_version_id == selected_version.get("id"):
                self.status_callback(f"Уже установлено: {title}")
                self.detail_callback(
                    f"Версия {existing_record.get('version_number') or existing_version_id} уже есть в этой сборке."
                )
                return {
                    "state": "already_installed",
                    "files": existing_record.get("files", []),
                    "record": existing_record,
                    "version": selected_version,
                    "title": title,
                }

        installed = []

        # Если мод уже есть, но версия другая или файлы потеряны — ставим актуальную совместимую версию.
        # Старые файлы этого же проекта удаляем после успешной загрузки, чтобы не было дублей .jar.
        old_files = list((existing_record or {}).get("files", []))

        self.install_version(
            selected_version,
            instance,
            installed,
            project_type=project_type,
            depth=0,
            seen_version_ids=set(),
        )

        for old_file in old_files:
            old_path = Path(old_file)
            if old_path.exists() and str(old_path) not in installed:
                try:
                    old_path.unlink()
                    self.detail_callback(f"Удалён старый файл: {old_path.name}")
                except Exception:
                    logger.warning("Failed to remove old mod file: %s", old_path, exc_info=True)

        record = self.save_installed_index(instance, project, selected_version, installed, project_type)

        return {
            "state": "installed",
            "files": installed,
            "record": record,
            "version": selected_version,
            "title": title,
        }

    def update_project(self, record, instance):
        project = {
            "project_id": record.get("project_id"),
            "slug": record.get("slug"),
            "title": record.get("title"),
        }

        return self.install_project(project, instance, record.get("project_type", "mod"))

    def install_version(self, version, instance, installed, project_type="mod", depth=0, seen_version_ids=None):
        if seen_version_ids is None:
            seen_version_ids = set()

        if depth > 6:
            logger.warning("Dependency depth limit reached")
            return

        version_id = version.get("id")
        if version_id and version_id in seen_version_ids:
            return
        if version_id:
            seen_version_ids.add(version_id)

        if not self.version_is_compatible(version, instance, project_type):
            raise RuntimeError(self.build_incompatible_message(version, instance, project_type))

        name = version.get("name") or version.get("version_number") or version.get("id")
        self.status_callback(f"Установка: {name}")

        file_info = self.pick_primary_file(version)

        if not file_info:
            raise RuntimeError(f"У версии {name} нет файла для скачивания.")

        self.validate_file_for_project_type(file_info, project_type)

        install_dir = self.get_install_dir(instance, project_type)
        install_dir.mkdir(parents=True, exist_ok=True)

        target = install_dir / file_info["filename"]

        if target.exists():
            if self.file_matches_hash(target, file_info):
                self.detail_callback(f"Файл уже есть: {target.name}")
            else:
                self.detail_callback(f"Повторная загрузка (хеш не совпал): {target.name}")
                target.unlink()
                self.download_file(file_info["url"], target)
                self.verify_hash(target, file_info)
        else:
            self.download_file(file_info["url"], target)
            self.verify_hash(target, file_info)

        installed.append(str(target))
        logger.info("Installed mod file: %s", target)

        for dependency in version.get("dependencies", []):
            if dependency.get("dependency_type") != "required":
                continue

            dependency_version_id = dependency.get("version_id")
            dependency_project_id = dependency.get("project_id")

            if dependency_version_id:
                dependency_version = self.api.get_version(dependency_version_id)
                self.install_version(
                    dependency_version,
                    instance,
                    installed,
                    project_type=project_type,
                    depth=depth + 1,
                    seen_version_ids=seen_version_ids,
                )
                continue

            if dependency_project_id:
                versions = self.api.get_project_versions(
                    project_id_or_slug=dependency_project_id,
                    minecraft_version=instance["minecraft_version"],
                    loader=instance.get("loader"),
                )

                if versions:
                    self.install_version(
                        self.pick_best_version(versions),
                        instance,
                        installed,
                        project_type=project_type,
                        depth=depth + 1,
                        seen_version_ids=seen_version_ids,
                    )

    def pick_best_version(self, versions):
        releases = [version for version in versions if version.get("version_type") == "release"]
        pool = releases or versions
        return sorted(pool, key=lambda item: item.get("date_published") or "", reverse=True)[0]

    def pick_primary_file(self, version):
        files = version.get("files", [])

        if not files:
            return None

        for file in files:
            if file.get("primary"):
                return file

        return files[0]

    def download_file(self, url, target: Path):
        logger.info("Downloading %s -> %s", url, target)

        tmp = target.with_suffix(target.suffix + ".tmp")
        last_error = None

        for attempt in range(3):
            try:
                with requests.get(url, stream=True, timeout=60, headers={"User-Agent": USER_AGENT}) as response:
                    response.raise_for_status()

                    total = int(response.headers.get("content-length", 0))
                    downloaded = 0
                    start_time = time.time()

                    with open(tmp, "wb") as file:
                        for chunk in response.iter_content(chunk_size=1024 * 256):
                            if not chunk:
                                continue

                            file.write(chunk)
                            downloaded += len(chunk)

                            elapsed = max(time.time() - start_time, 0.001)
                            speed = downloaded / elapsed

                            if total:
                                progress = int(downloaded / total * 100)
                                self.progress_callback(progress)

                            self.transfer_callback(downloaded, total, speed)

                            self.detail_callback(
                                f"{self.mb(downloaded)} / {self.mb(total)} • {self.mb(speed)}/s"
                                if total
                                else f"{self.mb(downloaded)} • {self.mb(speed)}/s"
                            )

                if target.exists():
                    target.unlink()
                tmp.replace(target)
                return

            except (requests.ConnectionError, requests.Timeout) as e:
                last_error = e
                logger.warning("Download attempt %d/3 failed: %s", attempt + 1, e)
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except Exception:
                        pass

        raise RuntimeError(f"Не удалось скачать файл после 3 попыток: {last_error}")

    def file_matches_hash(self, path: Path, file_info):
        hashes = file_info.get("hashes", {})
        expected_sha512 = hashes.get("sha512")
        expected_sha1 = hashes.get("sha1")

        if expected_sha512:
            return self.file_hash(path, "sha512") == expected_sha512

        if expected_sha1:
            return self.file_hash(path, "sha1") == expected_sha1

        return True

    def verify_hash(self, path: Path, file_info):
        hashes = file_info.get("hashes", {})
        expected_sha512 = hashes.get("sha512")
        expected_sha1 = hashes.get("sha1")

        if expected_sha512:
            actual = self.file_hash(path, "sha512")

            if actual != expected_sha512:
                raise RuntimeError(f"SHA512 не совпал для файла:\n{path}")

        elif expected_sha1:
            actual = self.file_hash(path, "sha1")

            if actual != expected_sha1:
                raise RuntimeError(f"SHA1 не совпал для файла:\n{path}")

    def file_hash(self, path: Path, algorithm: str):
        hasher = hashlib.new(algorithm)

        with open(path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 256), b""):
                hasher.update(chunk)

        return hasher.hexdigest()

    def save_installed_index(self, instance, project, version, installed_files, project_type="mod"):
        data = load_mod_index(instance)

        project_id = project.get("project_id") or project.get("id") or version.get("project_id")
        slug = project.get("slug")

        record = {
            "project_id": project_id,
            "slug": slug,
            "title": project.get("title") or version.get("name") or slug or project_id,
            "author": project.get("author"),
            "description": project.get("description"),
            "icon_url": project.get("icon_url"),
            "project_type": project_type,
            "version_id": version.get("id"),
            "version_number": version.get("version_number"),
            "version_name": version.get("name"),
            "minecraft_version": instance.get("minecraft_version"),
            "loader": instance.get("loader"),
            "files": installed_files,
            "file_names": [Path(path).name for path in installed_files],
            "updated_at": version.get("date_published"),
            "installed_at": int(time.time()),
            "source": "Modrinth",
            "install_dir": self.get_install_dir(instance, project_type).name,
        }

        data["mods"] = [
            item for item in data.get("mods", [])
            if not (
                record_matches_project(item, record)
                and str(item.get("project_type", "mod")).lower() == str(project_type).lower()
            )
        ]

        data["mods"].append(record)
        save_mod_index(instance, data)
        return record

    def remove_from_index(self, instance, file_path: Path):
        index_path = Path(instance["path"]) / "mods_index.json"
        data = load_json(index_path, {"mods": []})
        file_str = str(file_path)

        changed = False

        for mod in data.get("mods", []):
            files = mod.get("files", [])
            if file_str in files:
                mod["files"] = [item for item in files if item != file_str]
                changed = True

        data["mods"] = [
            item for item in data.get("mods", [])
            if item.get("files")
        ]

        if changed:
            save_json(index_path, data)

        return changed

    def delete_mod_file(self, path: Path):
        if path.exists() and path.is_file():
            path.unlink()
            return True

        return False

    def mb(self, bytes_value):
        return f"{bytes_value / 1024 / 1024:.2f} MB"


class ModInstallerWorker(QThread):
    status = Signal(str)
    progress = Signal(int)
    success = Signal(str)
    failed = Signal(str, str)

    def __init__(self, project, instance):
        super().__init__()
        self.project = project or {}
        self.instance = instance or {}
        self.download_manager = DownloadManager()
        self.download_task_id = None

    def _safe_download_update(self, method_name, *args, **kwargs):
        """Проблемы с downloads.json не должны ломать установку проекта."""
        try:
            method = getattr(self.download_manager, method_name)
            return method(*args, **kwargs)
        except Exception:
            traceback.print_exc()
            return None

    def run(self):
        try:
            title = self.project.get("title") or self.project.get("slug") or "project"
            project_type = (self.project.get("project_type") or "mod").lower()
            kind_label = {
                "mod": "мода",
                "resourcepack": "ресурспака",
                "shader": "шейдера",
            }.get(project_type, "проекта")
            status_label = {
                "mod": "Мод",
                "resourcepack": "Ресурспак",
                "shader": "Шейдер",
            }.get(project_type, "Проект")

            self.download_task_id = self._safe_download_update(
                "start_task",
                kind=project_type,
                title=f"Установка {kind_label}: {title}",
                subtitle=f'Сборка: {self.instance.get("name", "Minecraft")}',
                total=100,
                metadata={
                    "project_id": self.project.get("project_id"),
                    "slug": self.project.get("slug"),
                    "instance_id": self.instance.get("id"),
                },
            )

            installer = ModInstaller(
                progress_callback=lambda v: self._on_progress(v),
                status_callback=lambda t: self._on_status(t),
                detail_callback=lambda t: self._on_detail(t),
                transfer_callback=lambda downloaded, total, speed: self._on_transfer(downloaded, total, speed),
            )

            installer.validate_instance_for_project_type(self.instance, project_type)

            self.status.emit(f"Поиск совместимой версии для {title}...")
            self._update_task(status=f"Поиск совместимой версии для {title}...")

            result = installer.install_project(self.project, self.instance, project_type=project_type)

            state = result.get("state") if isinstance(result, dict) else "installed"
            files = result.get("files", []) if isinstance(result, dict) else result

            if state == "already_installed":
                status = f"{status_label} уже установлен"
            else:
                status = f"{status_label} установлен"

            self._safe_download_update("finish_task", self.download_task_id, status=status)
            self.progress.emit(100)
            self.success.emit(status + "\n" + "\n".join(files))

        except Exception as error:
            if self.download_task_id:
                self._safe_download_update("fail_task", self.download_task_id, str(error), status="Ошибка установки")
            self.failed.emit(str(error), traceback.format_exc())

    def _on_progress(self, value):
        self.progress.emit(int(value))
        if self.download_task_id:
            self._safe_download_update("update_task", self.download_task_id, progress=int(value))

    def _on_status(self, text):
        self.status.emit(str(text))
        if self.download_task_id:
            self._safe_download_update("update_task", self.download_task_id, status=str(text))

    def _on_detail(self, text):
        if self.download_task_id:
            self._safe_download_update("update_task", self.download_task_id, status=str(text))

    def _on_transfer(self, downloaded, total, speed):
        if self.download_task_id:
            self._safe_download_update(
                "update_task",
                self.download_task_id,
                downloaded_bytes=int(downloaded or 0),
                total_bytes=int(total or 0),
                speed_bps=int(speed or 0),
            )

    def _update_task(self, **kwargs):
        if self.download_task_id:
            self._safe_download_update("update_task", self.download_task_id, **kwargs)
