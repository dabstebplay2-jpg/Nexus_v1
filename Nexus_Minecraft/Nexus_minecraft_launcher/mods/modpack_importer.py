from __future__ import annotations

import hashlib
import json
import logging
import time
import zipfile
from pathlib import Path

import requests

from core.constants import USER_AGENT


logger = logging.getLogger(__name__)
from core.instance_manager import get_instance_manager
from storage.json_store import save_json


LOADER_DEPENDENCIES = {
    "fabric-loader": "fabric",
    "quilt-loader": "quilt",
    "forge": "forge",
    "neoforge": "neoforge",
}


class ModpackImportError(RuntimeError):
    pass


class ModpackImporter:
    def __init__(self, progress_callback=None, status_callback=None, detail_callback=None):
        self.progress_callback = progress_callback or (lambda value: None)
        self.status_callback = status_callback or (lambda text: None)
        self.detail_callback = detail_callback or (lambda text: None)

    def import_mrpack(self, archive_path: str | Path, ram_mb: int = 4096):
        archive_path = Path(archive_path)

        if not archive_path.exists():
            raise ModpackImportError(f"Файл не найден: {archive_path}")

        if archive_path.suffix.lower() != ".mrpack":
            raise ModpackImportError("Ожидается файл .mrpack")

        self.status_callback("Чтение modrinth.index.json...")

        with zipfile.ZipFile(archive_path, "r") as package:
            try:
                index = json.loads(package.read("modrinth.index.json").decode("utf-8"))
            except KeyError as error:
                raise ModpackImportError("В .mrpack нет modrinth.index.json") from error

            name = index.get("name") or archive_path.stem
            version_id = index.get("versionId") or index.get("version_id") or "unknown"
            dependencies = index.get("dependencies") or {}
            minecraft_version = dependencies.get("minecraft")

            if not minecraft_version:
                raise ModpackImportError("В modrinth.index.json не указана зависимость minecraft.")

            loader = self.detect_loader(dependencies)

            self.status_callback(f"Создание сборки: {name}")
            manager = get_instance_manager()
            instance = manager.create_instance(
                name=name,
                minecraft_version=minecraft_version,
                loader=loader,
                ram_mb=ram_mb,
            )

            instance_path = Path(instance["path"])
            minecraft_dir = Path(instance["minecraft_dir"])

            self.copy_overrides(package, minecraft_dir)

            files = index.get("files") or []
            downloaded_files = self.download_files(files, minecraft_dir)

            modpack_info = {
                "name": name,
                "summary": index.get("summary"),
                "version_id": version_id,
                "format_version": index.get("formatVersion"),
                "dependencies": dependencies,
                "source_file": str(archive_path),
                "imported_at": int(time.time()),
                "downloaded_files": downloaded_files,
            }
            save_json(instance_path / "modpack.json", modpack_info)

            try:
                manager.update_instance(instance["id"], {
                    "modpack": True,
                    "modpack_name": name,
                    "modpack_version_id": version_id,
                    "modpack_source": "mrpack",
                })
                instance = manager.get_instance(instance["id"]) or instance
            except Exception:
                pass

            self.progress_callback(100)
            self.status_callback("Модпак импортирован.")
            return instance

    def detect_loader(self, dependencies: dict) -> str:
        for dep_key, loader in LOADER_DEPENDENCIES.items():
            if dep_key in dependencies:
                return loader
        return "vanilla"

    def copy_overrides(self, package: zipfile.ZipFile, minecraft_dir: Path):
        self.status_callback("Копирование overrides...")
        minecraft_dir.mkdir(parents=True, exist_ok=True)

        for member in package.infolist():
            if member.is_dir():
                continue

            name = member.filename.replace("\\", "/")
            if name.startswith("overrides/"):
                relative = name[len("overrides/"):]
            elif name.startswith("client-overrides/"):
                relative = name[len("client-overrides/"):]
            else:
                continue

            if not relative or relative.startswith("../") or "/../" in relative:
                continue

            target = minecraft_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.open(member, "r") as src, open(target, "wb") as dst:
                dst.write(src.read())

    def download_files(self, files: list[dict], minecraft_dir: Path):
        total_files = max(1, len(files))
        downloaded = []

        for index, file_entry in enumerate(files):
            if self.should_skip_file(file_entry):
                continue

            rel_path = file_entry.get("path")
            downloads = file_entry.get("downloads") or []
            if not rel_path or not downloads:
                continue

            target = minecraft_dir / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)

            if target.exists() and self.file_matches(target, file_entry):
                self.detail_callback(f"Уже есть: {rel_path}")
                downloaded.append(str(target))
                self.progress_callback(int((index + 1) / total_files * 100))
                continue

            self.status_callback(f"Скачивание: {Path(rel_path).name}")
            self.download_one(downloads[0], target, file_entry)
            downloaded.append(str(target))
            self.progress_callback(int((index + 1) / total_files * 100))

        return downloaded

    def should_skip_file(self, file_entry: dict) -> bool:
        env = file_entry.get("env") or {}
        client = str(env.get("client") or "").lower()
        return client == "unsupported"

    def download_one(self, url: str, target: Path, file_entry: dict):
        tmp = target.with_suffix(target.suffix + ".tmp")
        last_error = None

        for attempt in range(3):
            try:
                with requests.get(url, stream=True, timeout=90, headers={"User-Agent": USER_AGENT}) as response:
                    response.raise_for_status()
                    total = int(response.headers.get("content-length") or file_entry.get("fileSize") or 0)
                    downloaded = 0
                    started = time.time()

                    with open(tmp, "wb") as output:
                        for chunk in response.iter_content(chunk_size=1024 * 256):
                            if not chunk:
                                continue
                            output.write(chunk)
                            downloaded += len(chunk)

                            elapsed = max(time.time() - started, 0.001)
                            speed = downloaded / elapsed
                            if total:
                                self.detail_callback(
                                    f"{target.name}: {self.mb(downloaded)} / {self.mb(total)} • {self.mb(speed)}/s"
                                )
                            else:
                                self.detail_callback(f"{target.name}: {self.mb(downloaded)} • {self.mb(speed)}/s")

                if target.exists():
                    target.unlink()
                tmp.replace(target)

                if not self.file_matches(target, file_entry):
                    raise ModpackImportError(f"Хеш файла не совпал: {target.name}")

                return

            except (requests.ConnectionError, requests.Timeout) as e:
                last_error = e
                logger.warning("Modpack download attempt %d/3 failed: %s", attempt + 1, e)
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                if tmp.exists():
                    try:
                        tmp.unlink()
                    except Exception:
                        pass

        raise ModpackImportError(f"Не удалось скачать файл после 3 попыток: {last_error}")

    def file_matches(self, path: Path, file_entry: dict) -> bool:
        hashes = file_entry.get("hashes") or {}
        if hashes.get("sha512"):
            return self.file_hash(path, "sha512") == hashes["sha512"]
        if hashes.get("sha1"):
            return self.file_hash(path, "sha1") == hashes["sha1"]

        expected_size = file_entry.get("fileSize")
        if expected_size:
            try:
                return path.stat().st_size == int(expected_size)
            except Exception:
                return False

        return True

    def file_hash(self, path: Path, algorithm: str):
        hasher = hashlib.new(algorithm)
        with open(path, "rb") as file:
            for chunk in iter(lambda: file.read(1024 * 256), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def mb(self, bytes_value):
        return f"{float(bytes_value or 0) / 1024 / 1024:.2f} MB"
