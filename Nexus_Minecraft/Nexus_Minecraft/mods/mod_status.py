from __future__ import annotations

from pathlib import Path
from typing import Any

from storage.json_store import load_json, save_json


def normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def index_path_for_instance(instance: dict) -> Path:
    return Path(instance.get("path") or ".") / "mods_index.json"


def load_mod_index(instance: dict) -> dict:
    data = load_json(index_path_for_instance(instance), {"mods": []})
    if not isinstance(data, dict):
        data = {"mods": []}
    if not isinstance(data.get("mods"), list):
        data["mods"] = []
    return data


def save_mod_index(instance: dict, data: dict) -> None:
    if not isinstance(data, dict):
        data = {"mods": []}
    if not isinstance(data.get("mods"), list):
        data["mods"] = []
    save_json(index_path_for_instance(instance), data)


def project_keys(project: dict) -> set[str]:
    keys = set()
    for key in ("project_id", "id", "slug"):
        value = normalize(project.get(key))
        if value:
            keys.add(value)
    return keys


def record_keys(record: dict) -> set[str]:
    keys = set()
    for key in ("project_id", "id", "slug"):
        value = normalize(record.get(key))
        if value:
            keys.add(value)
    return keys


def record_matches_project(record: dict, project: dict) -> bool:
    return bool(project_keys(project) & record_keys(record))


def record_files_exist(record: dict) -> bool:
    files = record.get("files") or []
    if not files:
        return False
    return any(Path(path).exists() for path in files)


def find_installed_record(instance: dict, project: dict, project_type: str | None = None) -> dict | None:
    data = load_mod_index(instance)
    project_type = normalize(project_type) if project_type else None

    for record in data.get("mods", []):
        if project_type and normalize(record.get("project_type")) != project_type:
            continue
        if record_matches_project(record, project):
            return record

    return None


def installed_state(instance: dict, project: dict, project_type: str = "mod") -> dict:
    record = find_installed_record(instance, project, project_type)
    if not record:
        return {
            "state": "not_installed",
            "label": "Установить",
            "record": None,
            "files_exist": False,
        }

    files_exist = record_files_exist(record)
    if files_exist:
        return {
            "state": "installed",
            "label": "✓ Установлено",
            "record": record,
            "files_exist": True,
        }

    return {
        "state": "missing_files",
        "label": "Переустановить",
        "record": record,
        "files_exist": False,
    }


def remove_record(instance: dict, record: dict) -> bool:
    data = load_mod_index(instance)
    before = len(data.get("mods", []))
    data["mods"] = [
        item for item in data.get("mods", [])
        if not (
            record_matches_project(item, record)
            and normalize(item.get("project_type")) == normalize(record.get("project_type"))
        )
    ]
    changed = len(data.get("mods", [])) != before
    if changed:
        save_mod_index(instance, data)
    return changed


def cleanup_missing_records(instance: dict) -> int:
    data = load_mod_index(instance)
    before = len(data.get("mods", []))
    data["mods"] = [
        record for record in data.get("mods", [])
        if record_files_exist(record)
    ]
    removed = before - len(data.get("mods", []))
    if removed:
        save_mod_index(instance, data)
    return removed
