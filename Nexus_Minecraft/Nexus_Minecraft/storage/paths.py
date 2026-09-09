from __future__ import annotations

import os
import sys
from pathlib import Path

APP_DIR_NAME = "NexusLauncher"


def _project_root() -> Path:
    # storage/paths.py -> project root
    return Path(__file__).resolve().parents[1]


def _appdata_root() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / APP_DIR_NAME
    return Path.home() / "AppData" / "Roaming" / APP_DIR_NAME


def get_base_dir() -> Path:
    """
    Единая корневая папка данных лаунчера.

    В режиме разработки данные лежат рядом с проектом, независимо от того,
    из какой папки был запущен python. В собранном .exe данные лежат в AppData,
    чтобы лаунчер мог работать из Program Files/Downloads без прав администратора.
    """
    if getattr(sys, "frozen", False):
        return _appdata_root()
    return _project_root()


BASE_DIR = get_base_dir()
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = DATA_DIR / "logs"
INSTANCES_DIR = DATA_DIR / "instances"
INSTANCES_FILE = INSTANCES_DIR / "instances.json"
STORAGE_DIR = DATA_DIR / "storage"
MODS_DIR = DATA_DIR / "mods"
SKINS_DIR = DATA_DIR / "skins"


def ensure_project_dirs():
    for directory in [DATA_DIR, LOGS_DIR, INSTANCES_DIR, STORAGE_DIR, MODS_DIR, SKINS_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
