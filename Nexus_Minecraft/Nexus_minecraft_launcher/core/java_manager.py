import logging
import os
import re
import shutil
import subprocess
import json
from pathlib import Path


logger = logging.getLogger(__name__)

_java_version_cache: dict[str, int | None] = {}


def get_java_major_version(java_path: str):
    if not java_path:
        return None

    cached = _java_version_cache.get(java_path)
    if cached is not None:
        return cached

    try:
        result = subprocess.run(
            [java_path, "-version"],
            capture_output=True,
            text=True,
            timeout=8,
        )

        output = result.stderr + result.stdout

        match = re.search(r'version "(\d+)', output)

        if match:
            major = int(match.group(1))

            if major == 1:
                legacy = re.search(r'version "1\.(\d+)', output)
                if legacy:
                    _java_version_cache[java_path] = int(legacy.group(1))
                    return _java_version_cache[java_path]

            _java_version_cache[java_path] = major
            return major

        match = re.search(r'openjdk (\d+)', output.lower())

        if match:
            _java_version_cache[java_path] = int(match.group(1))
            return _java_version_cache[java_path]

    except Exception:
        logger.exception("Failed to detect Java version: %s", java_path)

    _java_version_cache[java_path] = None
    return None


def find_java_candidates():
    candidates = []

    java_from_path = shutil.which("java")
    if java_from_path:
        candidates.append(Path(java_from_path))
        logger.info("Java candidate from PATH: %s", java_from_path)

    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = Path(java_home) / "bin" / "java.exe"
        candidates.append(candidate)
        logger.info("Java candidate from JAVA_HOME: %s", candidate)

    program_dirs = [
        Path(os.environ.get("ProgramFiles", "C:/Program Files")),
        Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")),
    ]

    patterns = [
        "Java/*/bin/java.exe",
        "Eclipse Adoptium/*/bin/java.exe",
        "Microsoft/*/bin/java.exe",
        "Zulu/*/bin/java.exe",
        "BellSoft/*/bin/java.exe",
    ]

    for base_dir in program_dirs:
        if not base_dir.exists():
            continue

        for pattern in patterns:
            found = list(base_dir.glob(pattern))
            candidates.extend(found)

            for candidate in found:
                logger.info("Java candidate from Program Files: %s", candidate)

    appdata = os.environ.get("APPDATA")
    if appdata:
        minecraft_runtime = Path(appdata) / ".minecraft" / "runtime"

        if minecraft_runtime.exists():
            found = list(minecraft_runtime.rglob("java.exe"))
            candidates.extend(found)

            for candidate in found:
                logger.info("Java candidate from Minecraft runtime: %s", candidate)

    unique = []
    seen = set()

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except Exception:
            resolved = candidate

        key = str(resolved).lower()

        if key in seen:
            continue

        if resolved.exists() and resolved.is_file():
            seen.add(key)
            unique.append(resolved)

    return unique


def find_java_executable(min_major: int | None = None):
    candidates = find_java_candidates()

    if not candidates:
        logger.error("Java executable not found")
        return None

    detected = []

    for candidate in candidates:
        major = get_java_major_version(str(candidate))

        logger.info("Java detected: version=%s path=%s", major, candidate)

        if major:
            detected.append(
                {
                    "path": str(candidate),
                    "major": major,
                    "version": major,
                }
            )

    if detected:
        if min_major:
            compatible = [
                item for item in detected
                if item["major"] >= min_major
            ]

            if compatible:
                compatible.sort(key=lambda item: item["major"], reverse=True)
                selected = compatible[0]

                logger.info(
                    "Selected compatible Java: version=%s path=%s",
                    selected["major"],
                    selected["path"],
                )

                return selected["path"]

            detected.sort(key=lambda item: item["major"], reverse=True)
            best = detected[0]

            logger.warning(
                "No compatible Java found. Best available: version=%s path=%s required=%s",
                best["major"],
                best["path"],
                min_major,
            )

            return None

        detected.sort(key=lambda item: item["major"], reverse=True)
        selected = detected[0]

        logger.info(
            "Selected newest Java: version=%s path=%s",
            selected["major"],
            selected["path"],
        )

        return selected["path"]

    selected = str(candidates[0])
    logger.warning("Selected Java without version detection: %s", selected)
    return selected


def get_best_installed_java_info():
    candidates = find_java_candidates()
    detected = []

    for candidate in candidates:
        major = get_java_major_version(str(candidate))

        if major:
            detected.append(
                {
                    "path": str(candidate),
                    "major": major,
                    "version": major,
                }
            )

    if not detected:
        return None

    detected.sort(key=lambda item: item["major"], reverse=True)
    return detected[0]


def get_required_java_major(minecraft_dir: str, launch_version: str, fallback_version: str):
    versions_dir = Path(minecraft_dir) / "versions"

    candidates = [
        versions_dir / launch_version / f"{launch_version}.json",
        versions_dir / fallback_version / f"{fallback_version}.json",
    ]

    for path in candidates:
        if not path.exists():
            continue

        try:
            data = json.loads(path.read_text(encoding="utf-8"))

            java_version = data.get("javaVersion", {})
            major = java_version.get("majorVersion")

            if major:
                return int(major)

            inherits = data.get("inheritsFrom")

            if inherits:
                inherited_path = versions_dir / inherits / f"{inherits}.json"

                if inherited_path.exists():
                    inherited = json.loads(inherited_path.read_text(encoding="utf-8"))
                    inherited_java = inherited.get("javaVersion", {})
                    inherited_major = inherited_java.get("majorVersion")

                    if inherited_major:
                        return int(inherited_major)

        except Exception:
            logger.exception("Failed to read required Java version from %s", path)

    return 17


def ensure_java_is_compatible(java_path: str, required_major: int):
    actual_major = get_java_major_version(java_path)

    if not actual_major:
        raise RuntimeError(
            "Не удалось определить версию Java.\n\n"
            "Проверь команду:\n"
            "java -version"
        )

    if actual_major < required_major:
        raise RuntimeError(
            f"Для этой версии Minecraft нужна Java {required_major} или новее.\n\n"
            f"Сейчас используется Java {actual_major}:\n"
            f"{java_path}\n\n"
            f"Решение: установи Java {required_major}+ или выбери более старую версию Minecraft."
        )

    return actual_major


def get_java_download_url(required_major: int):
    return (
        "https://adoptium.net/temurin/releases/"
        f"?version={required_major}&os=windows&arch=x64&package=jdk"
    )


def get_java_winget_command(required_major: int):
    return f"winget install EclipseAdoptium.Temurin.{required_major}.JDK"


def build_java_required_message(required_major: int):
    best = get_best_installed_java_info()

    if best:
        current_text = f'Сейчас найдена Java {best["major"]}:\n{best["path"]}'
    else:
        current_text = "Java на компьютере не найдена."

    return (
        f"Для этой версии Minecraft нужна Java {required_major} или новее.\n\n"
        f"{current_text}\n\n"
        f"Nexus может открыть страницу скачивания Java {required_major}."
    )