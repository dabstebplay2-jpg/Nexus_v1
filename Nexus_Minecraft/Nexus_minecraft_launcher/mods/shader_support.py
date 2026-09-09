from __future__ import annotations

from pathlib import Path

from storage.json_store import load_json


SHADER_LOADER_SLUGS = {
    "iris",
    "oculus",
    "optifine",
    "canvas",
    "rubidium",
    "embeddium",
}

SHADER_LOADER_TITLES = {
    "iris",
    "iris shaders",
    "oculus",
    "optifine",
    "canvas",
}


def minecraft_dir(instance: dict) -> Path:
    if instance.get("minecraft_dir"):
        return Path(instance["minecraft_dir"])
    return Path(instance.get("path", "")) / ".minecraft"


def shaderpacks_dir(instance: dict) -> Path:
    return minecraft_dir(instance) / "shaderpacks"


def mods_index_path(instance: dict) -> Path:
    return Path(instance.get("path", "")) / "mods_index.json"


def installed_projects(instance: dict) -> list[dict]:
    data = load_json(mods_index_path(instance), {"mods": []})
    mods = data.get("mods", [])
    return mods if isinstance(mods, list) else []


def has_shader_loader(instance: dict) -> bool:
    """Returns True if the instance probably can load shader packs."""
    for record in installed_projects(instance):
        title = str(record.get("title") or "").strip().lower()
        slug = str(record.get("slug") or record.get("project_id") or "").strip().lower()
        if slug in SHADER_LOADER_SLUGS or title in SHADER_LOADER_TITLES:
            return True

    # OptiFine is often installed manually and may not be in Nexus index.
    mods_dir = minecraft_dir(instance) / "mods"
    if mods_dir.exists():
        for file in mods_dir.glob("*.jar"):
            name = file.name.lower()
            if "iris" in name or "oculus" in name or "optifine" in name:
                return True

    return False


def recommended_shader_loader(instance: dict) -> dict:
    """Best-effort recommendation for shader support based on loader."""
    loader = str(instance.get("loader") or "vanilla").lower()

    if loader in {"fabric", "quilt"}:
        return {
            "slug": "iris",
            "title": "Iris Shaders",
            "project_type": "mod",
            "reason": "Для Fabric/Quilt лучше всего поставить Iris Shaders.",
        }

    if loader in {"forge", "neoforge"}:
        return {
            "slug": "oculus",
            "title": "Oculus",
            "project_type": "mod",
            "reason": "Для Forge/NeoForge обычно нужен Oculus или совместимый shader loader.",
        }

    return {
        "slug": "iris",
        "title": "Iris Shaders",
        "project_type": "mod",
        "reason": "Vanilla Minecraft не умеет загружать shader packs без Iris/OptiFine/Oculus.",
    }


def shader_status_text(instance: dict) -> str:
    folder = shaderpacks_dir(instance)
    count = len(list(folder.glob("*.zip"))) if folder.exists() else 0

    if has_shader_loader(instance):
        return f"Шейдеры готовы • {count} паков"
    return f"Нужен Iris/Oculus/OptiFine • {count} паков"
