from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

import requests

from core.constants import USER_AGENT


logger = logging.getLogger(__name__)

CUSTOM_SKIN_LOADER_PROJECT = "customskinloader"
SUPPORTED_LOADERS = {"fabric", "forge", "neoforge", "quilt"}
MODRINTH_VERSIONS_URL = f"https://api.modrinth.com/v2/project/{CUSTOM_SKIN_LOADER_PROJECT}/version"


@dataclass
class CustomSkinLoaderResult:
    prepared: bool
    message: str
    mod_path: Path | None = None
    skin_path: Path | None = None


def _safe_username(username: str | None) -> str:
    username = "".join(ch for ch in (username or "NexusPlayer") if ch.isalnum() or ch == "_")
    return username[:16] or "NexusPlayer"


def _write_config(minecraft_dir: Path) -> Path:
    config_dir = minecraft_dir / "CustomSkinLoader"
    config_dir.mkdir(parents=True, exist_ok=True)

    config_path = config_dir / "CustomSkinLoader.json"
    config = {
        "enable": True,
        "loadlist": [
            {
                "name": "LocalSkin",
                "type": "LocalSkin",
                "root": "CustomSkinLoader/LocalSkin",
                "checkPNG": True,
            },
            {
                "name": "ElyBy",
                "type": "ElyBy",
            },
            {
                "name": "Mojang",
                "type": "MojangAPI",
            },
        ],
    }

    tmp = config_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(config_path)
    return config_path


def _find_existing_mod(mods_dir: Path) -> Path | None:
    candidates = sorted(
        path for path in mods_dir.glob("*.jar")
        if "customskinloader" in path.name.lower()
    )
    return candidates[0] if candidates else None


def _request_versions(minecraft_version: str, loader: str) -> list[dict]:
    params = {
        "game_versions": json.dumps([minecraft_version]),
        "loaders": json.dumps([loader]),
    }
    headers = {"User-Agent": USER_AGENT}
    response = requests.get(MODRINTH_VERSIONS_URL, params=params, headers=headers, timeout=20)
    response.raise_for_status()
    versions = response.json()
    return versions if isinstance(versions, list) else []


def _download_mod(minecraft_version: str, loader: str, mods_dir: Path) -> Path:
    versions = _request_versions(minecraft_version, loader)

    if not versions and loader == "neoforge":
        versions = _request_versions(minecraft_version, "forge")

    if not versions:
        raise RuntimeError(
            "Не удалось найти CustomSkinLoader для этой версии Minecraft и загрузчика. "
            "Локальный PNG-скин подготовлен, но мод нужно поставить вручную."
        )

    files = versions[0].get("files") or []
    primary = next((file for file in files if file.get("primary")), None) or (files[0] if files else None)
    if not primary or not primary.get("url"):
        raise RuntimeError("В ответе Modrinth нет файла CustomSkinLoader для скачивания.")

    filename = primary.get("filename") or "CustomSkinLoader.jar"
    destination = mods_dir / filename
    tmp = destination.with_suffix(destination.suffix + ".part")

    headers = {"User-Agent": USER_AGENT}
    with requests.get(primary["url"], headers=headers, timeout=45, stream=True) as response:
        response.raise_for_status()
        with tmp.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    file.write(chunk)

    if tmp.read_bytes()[:2] != b"PK":
        tmp.unlink(missing_ok=True)
        raise RuntimeError("Скачанный CustomSkinLoader не похож на jar-файл.")

    tmp.replace(destination)
    return destination


def prepare_custom_skin_loader(instance: dict, account: dict | None, skin: dict | None, set_status=None) -> CustomSkinLoaderResult:
    loader = str(instance.get("loader") or "vanilla").lower()
    if not skin:
        return CustomSkinLoaderResult(False, "Локальный skin не выбран.")

    skin_source = Path(skin.get("path") or "")
    if not skin_source.exists():
        return CustomSkinLoaderResult(False, "Файл выбранного skin не найден.")

    if loader not in SUPPORTED_LOADERS:
        return CustomSkinLoaderResult(
            False,
            "Vanilla Minecraft не умеет применять локальный PNG-скин из лаунчера. "
            "Для этого нужна сборка Fabric, Forge, NeoForge или Quilt с CustomSkinLoader.",
        )

    minecraft_dir = Path(instance["minecraft_dir"])
    mods_dir = minecraft_dir / "mods"
    local_skins_dir = minecraft_dir / "CustomSkinLoader" / "LocalSkin" / "skins"

    mods_dir.mkdir(parents=True, exist_ok=True)
    local_skins_dir.mkdir(parents=True, exist_ok=True)

    username = _safe_username((account or {}).get("username") or (account or {}).get("display_name"))
    local_skin_path = local_skins_dir / f"{username}.png"
    shutil.copy2(skin_source, local_skin_path)
    _write_config(minecraft_dir)

    existing_mod = _find_existing_mod(mods_dir)
    if existing_mod:
        return CustomSkinLoaderResult(True, "CustomSkinLoader уже установлен.", existing_mod, local_skin_path)

    if set_status:
        set_status("Установка CustomSkinLoader для локального skin...")

    mod_path = _download_mod(str(instance.get("minecraft_version") or ""), loader, mods_dir)
    logger.info("CustomSkinLoader installed: %s", mod_path)

    return CustomSkinLoaderResult(True, "CustomSkinLoader подготовлен.", mod_path, local_skin_path)
