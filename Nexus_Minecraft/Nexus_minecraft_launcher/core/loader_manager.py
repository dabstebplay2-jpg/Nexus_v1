import json
import logging
import traceback
from pathlib import Path

import minecraft_launcher_lib

try:
    from minecraft_launcher_lib.exceptions import UnsupportedVersion
except Exception:
    UnsupportedVersion = None


logger = logging.getLogger(__name__)


class LoaderManager:
    """
    Установка и поиск Minecraft mod loader'ов.

    Цель этого файла:
    - не падать на старых версиях Minecraft;
    - красиво объяснять неподдерживаемые связки;
    - не переустанавливать loader, если он уже есть;
    - находить launch_version после установки;
    - быть безопасным для .exe и обычного python main.py.
    """

    SUPPORTED_LOADERS = [
        "vanilla",
        "fabric",
        "forge",
        "neoforge",
        "quilt",
    ]

    LOADER_MIN_VERSION = {
        # Fabric не поддерживает очень старые версии вроде 1.12.2.
        # Реально Fabric начинается примерно с 1.14+.
        "fabric": (1, 14, 0),

        # Quilt также не подходит для старых версий вроде 1.12.2.
        "quilt": (1, 14, 0),

        # NeoForge — современная ветка, старые версии Minecraft не поддерживает.
        "neoforge": (1, 20, 1),
    }

    LOADER_LABELS = {
        "vanilla": "Vanilla",
        "fabric": "Fabric",
        "forge": "Forge",
        "neoforge": "NeoForge",
        "quilt": "Quilt",
    }

    LOADER_KEYWORDS = {
        "fabric": ["fabric", "fabric-loader"],
        "forge": ["forge"],
        "neoforge": ["neoforge"],
        "quilt": ["quilt", "quilt-loader"],
    }

    def install_loader(
        self,
        loader_id: str,
        minecraft_version: str,
        minecraft_dir: str,
        callback=None,
        force_reinstall: bool = False,
    ):
        loader_id = self.normalize_loader_id(loader_id)
        minecraft_version = str(minecraft_version or "").strip()
        minecraft_path = Path(minecraft_dir)

        self.validate_basic_inputs(
            loader_id=loader_id,
            minecraft_version=minecraft_version,
            minecraft_path=minecraft_path,
        )

        if loader_id == "vanilla":
            logger.info(
                "Vanilla selected, launch version is base Minecraft version: %s",
                minecraft_version,
            )
            return minecraft_version

        logger.info(
            "Preparing loader installation: loader=%s, minecraft_version=%s, minecraft_dir=%s",
            loader_id,
            minecraft_version,
            minecraft_path,
        )

        self.ensure_minecraft_dirs(minecraft_path)

        known_message = self.get_known_unsupported_message(
            loader_id=loader_id,
            minecraft_version=minecraft_version,
        )

        if known_message:
            raise RuntimeError(known_message)

        if not force_reinstall:
            installed_version = self.find_installed_loader_version(
                loader_id=loader_id,
                minecraft_version=minecraft_version,
                minecraft_dir=minecraft_path,
            )

            if installed_version:
                logger.info(
                    "Loader already installed: loader=%s launch_version=%s",
                    loader_id,
                    installed_version,
                )
                self.emit_status(
                    callback,
                    f"{self.get_loader_label(loader_id)} уже установлен.",
                )
                return installed_version

        self.emit_status(
            callback,
            f"Установка {self.get_loader_label(loader_id)} для Minecraft {minecraft_version}...",
        )

        try:
            loader = self.get_library_loader(loader_id)
            self.run_loader_install(
                loader=loader,
                loader_id=loader_id,
                minecraft_version=minecraft_version,
                minecraft_path=minecraft_path,
                callback=callback,
            )

        except Exception as error:
            raise RuntimeError(
                self.build_install_error_message(
                    loader_id=loader_id,
                    minecraft_version=minecraft_version,
                    minecraft_path=minecraft_path,
                    error=error,
                )
            ) from error

        launch_version = self.find_installed_loader_version(
            loader_id=loader_id,
            minecraft_version=minecraft_version,
            minecraft_dir=minecraft_path,
        )

        if not launch_version:
            available_versions = self.describe_available_versions(minecraft_path)

            raise RuntimeError(
                f"{self.get_loader_label(loader_id)} вроде бы установился, "
                f"но Nexus не смог найти версию запуска.\n\n"
                f"Minecraft: {minecraft_version}\n"
                f"Loader: {self.get_loader_label(loader_id)}\n"
                f"Папка версий:\n{minecraft_path / 'versions'}\n\n"
                f"Найденные версии:\n{available_versions}\n\n"
                f"Что можно сделать:\n"
                f"1. Перезапусти лаунчер.\n"
                f"2. Удали эту сборку и создай заново.\n"
                f"3. Попробуй другую версию Minecraft, например 1.20.1 + Fabric."
            )

        logger.info(
            "Detected loader launch version: loader=%s launch_version=%s",
            loader_id,
            launch_version,
        )

        self.emit_status(
            callback,
            f"{self.get_loader_label(loader_id)} готов.",
        )

        return launch_version

    def normalize_loader_id(self, loader_id: str):
        loader_id = str(loader_id or "vanilla").lower().strip()

        aliases = {
            "": "vanilla",
            "none": "vanilla",
            "no": "vanilla",
            "default": "vanilla",
            "fabric-loader": "fabric",
            "forge-loader": "forge",
            "neo-forge": "neoforge",
            "neo forge": "neoforge",
            "quilt-loader": "quilt",
        }

        return aliases.get(loader_id, loader_id)

    def validate_basic_inputs(self, loader_id: str, minecraft_version: str, minecraft_path: Path):
        if not minecraft_version:
            raise RuntimeError(
                "Не указана версия Minecraft.\n\n"
                "Создай сборку заново и выбери конкретную версию Minecraft."
            )

        if loader_id not in self.SUPPORTED_LOADERS:
            supported = ", ".join(self.SUPPORTED_LOADERS)

            raise RuntimeError(
                f"Неподдерживаемый loader: {loader_id}\n\n"
                f"Поддерживаются: {supported}"
            )

        if not minecraft_path:
            raise RuntimeError(
                "Не указана папка Minecraft для сборки.\n\n"
                "Создай сборку заново."
            )

    def ensure_minecraft_dirs(self, minecraft_path: Path):
        minecraft_path.mkdir(parents=True, exist_ok=True)
        (minecraft_path / "versions").mkdir(parents=True, exist_ok=True)
        (minecraft_path / "libraries").mkdir(parents=True, exist_ok=True)

    def get_loader_label(self, loader_id: str):
        return self.LOADER_LABELS.get(loader_id, loader_id.capitalize())

    def parse_minecraft_version(self, version: str):
        """
        Превращает:
        1.12.2 -> (1, 12, 2)
        1.20.1 -> (1, 20, 1)
        26.1.2 -> (26, 1, 2)

        Если версия нестандартная, например snapshot, возвращает None.
        """
        try:
            parts = str(version).split(".")
            numbers = []

            for part in parts[:3]:
                clean = ""

                for char in part:
                    if char.isdigit():
                        clean += char
                    else:
                        break

                if clean == "":
                    return None

                numbers.append(int(clean))

            while len(numbers) < 3:
                numbers.append(0)

            return tuple(numbers[:3])

        except Exception:
            return None

    def version_is_less(self, current, minimum):
        if current is None:
            return False

        return tuple(current) < tuple(minimum)

    def get_known_unsupported_message(self, loader_id: str, minecraft_version: str):
        parsed_version = self.parse_minecraft_version(minecraft_version)

        if loader_id in self.LOADER_MIN_VERSION:
            min_version = self.LOADER_MIN_VERSION[loader_id]

            if self.version_is_less(parsed_version, min_version):
                min_text = ".".join(str(part) for part in min_version).rstrip(".0")
                loader_label = self.get_loader_label(loader_id)

                if loader_id in {"fabric", "quilt"}:
                    return (
                        f"{loader_label} не поддерживает Minecraft {minecraft_version}.\n\n"
                        f"Причина:\n"
                        f"{loader_label} не подходит для старых версий вроде 1.12.2.\n\n"
                        f"Что можно сделать:\n"
                        f"1. Создай сборку Vanilla для Minecraft {minecraft_version}.\n"
                        f"2. Для старого модового Minecraft обычно нужен Forge.\n"
                        f"3. Для Fabric лучше создай сборку Minecraft 1.20.1 или 1.21.x.\n\n"
                        f"Рекомендуемый вариант для Nexus сейчас:\n"
                        f"Minecraft 1.20.1 + Fabric + 4096 MB RAM."
                    )

                if loader_id == "neoforge":
                    return (
                        f"NeoForge не поддерживает Minecraft {minecraft_version}.\n\n"
                        f"NeoForge нужен для новых версий Minecraft.\n"
                        f"Минимальная ориентировочная версия: {min_text}+\n\n"
                        f"Что можно сделать:\n"
                        f"1. Выбери более новую версию Minecraft.\n"
                        f"2. Для старых версий используй Vanilla или Forge."
                    )

        return None

    def get_library_loader(self, loader_id: str):
        try:
            return minecraft_launcher_lib.mod_loader.get_mod_loader(loader_id)

        except Exception as error:
            raise RuntimeError(
                f"Nexus не смог получить установщик для loader: {loader_id}\n\n"
                f"Возможные причины:\n"
                f"1. Текущая версия minecraft-launcher-lib не поддерживает этот loader.\n"
                f"2. Loader называется иначе внутри библиотеки.\n"
                f"3. Нужна более новая версия minecraft-launcher-lib.\n\n"
                f"Техническая ошибка:\n{error}"
            ) from error

    def run_loader_install(
        self,
        loader,
        loader_id: str,
        minecraft_version: str,
        minecraft_path: Path,
        callback=None,
    ):
        try:
            loader.install(
                minecraft_version,
                str(minecraft_path),
                callback=callback,
            )

        except Exception as error:
            if self.is_unsupported_version_error(error):
                raise RuntimeError(
                    self.build_unsupported_version_message(
                        loader_id=loader_id,
                        minecraft_version=minecraft_version,
                        error=error,
                    )
                ) from error

            raise

    def is_unsupported_version_error(self, error: Exception):
        if UnsupportedVersion is not None and isinstance(error, UnsupportedVersion):
            return True

        error_name = error.__class__.__name__.lower()
        error_text = str(error).lower()

        return (
            "unsupportedversion" in error_name
            or "not supported" in error_text
            or "unsupported" in error_text
        )

    def build_unsupported_version_message(
        self,
        loader_id: str,
        minecraft_version: str,
        error: Exception,
    ):
        loader_label = self.get_loader_label(loader_id)

        if loader_id in {"fabric", "quilt"}:
            return (
                f"{loader_label} не поддерживает Minecraft {minecraft_version}.\n\n"
                f"Эта связка не может быть установлена через Nexus.\n\n"
                f"Что сделать:\n"
                f"1. Удали текущую сборку.\n"
                f"2. Создай новую сборку Minecraft 1.20.1 + Fabric.\n"
                f"3. Или выбери Vanilla для Minecraft {minecraft_version}.\n\n"
                f"Для старых версий вроде 1.12.2 обычно нужен Forge.\n\n"
                f"Техническая причина:\n{error}"
            )

        if loader_id == "neoforge":
            return (
                f"NeoForge не поддерживает Minecraft {minecraft_version}.\n\n"
                f"Выбери более новую версию Minecraft или другой loader.\n\n"
                f"Техническая причина:\n{error}"
            )

        return (
            f"{loader_label} не поддерживает Minecraft {minecraft_version} "
            f"или не может быть установлен текущей версией библиотеки.\n\n"
            f"Попробуй другую версию Minecraft или другой loader.\n\n"
            f"Техническая причина:\n{error}"
        )

    def build_install_error_message(
        self,
        loader_id: str,
        minecraft_version: str,
        minecraft_path: Path,
        error: Exception,
    ):
        loader_label = self.get_loader_label(loader_id)
        error_text = str(error)
        error_name = error.__class__.__name__

        if isinstance(error, RuntimeError):
            return error_text

        if isinstance(error, PermissionError):
            return (
                f"Нет доступа к папке сборки.\n\n"
                f"Папка:\n{minecraft_path}\n\n"
                f"Что сделать:\n"
                f"1. Закрой Minecraft, если он открыт.\n"
                f"2. Перезапусти Nexus.\n"
                f"3. Проверь, что папка не открыта другим процессом.\n\n"
                f"Техническая ошибка:\n{error_text}"
            )

        lower = error_text.lower()

        if "timed out" in lower or "timeout" in lower:
            return (
                f"Не удалось скачать файлы {loader_label}: истекло время ожидания.\n\n"
                f"Что сделать:\n"
                f"1. Проверь интернет.\n"
                f"2. Попробуй ещё раз.\n"
                f"3. Если включен VPN/Proxy — отключи и повтори.\n\n"
                f"Техническая ошибка:\n{error_text}"
            )

        if "ssl" in lower or "certificate" in lower:
            return (
                f"Ошибка SSL при скачивании {loader_label}.\n\n"
                f"Что сделать:\n"
                f"1. Проверь дату и время Windows.\n"
                f"2. Попробуй отключить VPN/Proxy.\n"
                f"3. Попробуй повторить позже.\n\n"
                f"Техническая ошибка:\n{error_text}"
            )

        if "connection" in lower or "network" in lower or "internet" in lower:
            return (
                f"Не удалось подключиться к серверу загрузки {loader_label}.\n\n"
                f"Что сделать:\n"
                f"1. Проверь интернет.\n"
                f"2. Попробуй повторить запуск.\n"
                f"3. Проверь VPN/Proxy.\n\n"
                f"Техническая ошибка:\n{error_text}"
            )

        logger.error(
            "Loader install failed: loader=%s version=%s path=%s error=%s\n%s",
            loader_id,
            minecraft_version,
            minecraft_path,
            error,
            traceback.format_exc(),
        )

        return (
            f"Не удалось установить {loader_label} для Minecraft {minecraft_version}.\n\n"
            f"Папка сборки:\n{minecraft_path}\n\n"
            f"Что можно попробовать:\n"
            f"1. Перезапустить Nexus Launcher.\n"
            f"2. Создать новую сборку.\n"
            f"3. Выбрать Minecraft 1.20.1 + Fabric.\n"
            f"4. Проверить интернет.\n\n"
            f"Техническая ошибка:\n"
            f"{error_name}: {error_text}"
        )

    def find_installed_loader_version(
        self,
        loader_id: str,
        minecraft_version: str,
        minecraft_dir: Path,
    ):
        candidates = self.list_installed_loader_versions(
            loader_id=loader_id,
            minecraft_version=minecraft_version,
            minecraft_dir=minecraft_dir,
        )

        if not candidates:
            return None

        candidates.sort(
            key=lambda item: (
                item.get("score", 0),
                item.get("mtime", 0),
            ),
            reverse=True,
        )

        return candidates[0]["version_id"]

    def list_installed_loader_versions(
        self,
        loader_id: str,
        minecraft_version: str,
        minecraft_dir: Path,
    ):
        versions_dir = Path(minecraft_dir) / "versions"

        if not versions_dir.exists():
            return []

        loader_id = self.normalize_loader_id(loader_id)
        minecraft_version = str(minecraft_version)

        candidates = []

        for item in versions_dir.iterdir():
            if not item.is_dir():
                continue

            version_id = item.name

            if version_id == minecraft_version:
                continue

            json_path = item / f"{version_id}.json"
            data = self.read_json_safe(json_path)

            score = self.score_loader_version_candidate(
                version_id=version_id,
                json_data=data,
                loader_id=loader_id,
                minecraft_version=minecraft_version,
            )

            if score <= 0:
                continue

            try:
                mtime = item.stat().st_mtime
            except Exception:
                mtime = 0

            candidates.append({
                "version_id": version_id,
                "path": item,
                "score": score,
                "mtime": mtime,
            })

        return candidates

    def score_loader_version_candidate(
        self,
        version_id: str,
        json_data: dict,
        loader_id: str,
        minecraft_version: str,
    ):
        version_lower = version_id.lower()
        json_id = str(json_data.get("id", "")).lower()
        inherits_from = str(json_data.get("inheritsFrom", "")).lower()
        minecraft_lower = minecraft_version.lower()

        keywords = self.LOADER_KEYWORDS.get(loader_id, [loader_id])

        loader_score = 0
        version_score = 0

        for keyword in keywords:
            keyword = keyword.lower()

            if keyword in version_lower:
                loader_score += 50

            if keyword in json_id:
                loader_score += 50

        if minecraft_lower in version_lower:
            version_score += 30

        if minecraft_lower in json_id:
            version_score += 20

        if inherits_from == minecraft_lower:
            version_score += 40

        libraries = json_data.get("libraries", [])

        if isinstance(libraries, list):
            for library in libraries:
                if not isinstance(library, dict):
                    continue

                name = str(library.get("name", "")).lower()

                for keyword in keywords:
                    if keyword.lower() in name:
                        loader_score += 20
                        break

        if loader_score <= 0:
            return 0

        if version_score <= 0:
            return 0

        return loader_score + version_score

    def read_json_safe(self, path: Path):
        try:
            if not path.exists():
                return {}

            return json.loads(path.read_text(encoding="utf-8"))

        except Exception:
            logger.warning("Failed to read version json: %s", path)
            return {}

    def describe_available_versions(self, minecraft_path: Path):
        versions_dir = Path(minecraft_path) / "versions"

        if not versions_dir.exists():
            return "Папка versions отсутствует."

        names = []

        try:
            for item in versions_dir.iterdir():
                if item.is_dir():
                    names.append(item.name)
        except Exception as error:
            return f"Не удалось прочитать папку versions: {error}"

        if not names:
            return "Версий пока нет."

        names = sorted(names)

        if len(names) > 20:
            visible = names[:20]
            visible.append(f"...и ещё {len(names) - 20}")

            return "\n".join(visible)

        return "\n".join(names)

    def emit_status(self, callback, text: str):
        if not callback:
            return

        try:
            if isinstance(callback, dict):
                setter = callback.get("setStatus")

                if callable(setter):
                    setter(text)
                    return

            setter = getattr(callback, "setStatus", None)

            if callable(setter):
                setter(text)

        except Exception:
            logger.debug("Failed to emit loader status", exc_info=True)


_loader_manager = LoaderManager()


def get_loader_manager():
    return _loader_manager