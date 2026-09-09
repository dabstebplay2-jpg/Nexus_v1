from __future__ import annotations

import json
import platform
import sys
import traceback
from pathlib import Path


def _print(title: str, value=""):
    print(f"\n=== {title} ===")
    if value not in (None, ""):
        print(value)


def _tail(path: Path, lines: int = 80):
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as error:
        return f"Не удалось прочитать {path}: {error}"
    return "\n".join(text.splitlines()[-lines:])


def run_diagnostics():
    _print("Nexus diagnostics")
    print("Python executable:", sys.executable)
    print("Python version:", sys.version)
    print("Platform:", platform.platform())
    print("Working directory:", Path.cwd())

    try:
        import PySide6
        print("PySide6:", getattr(PySide6, "__version__", "unknown"))
    except Exception as error:
        print("PySide6 import error:", error)

    try:
        import minecraft_launcher_lib
        print("minecraft-launcher-lib:", getattr(minecraft_launcher_lib, "__version__", "unknown"))
    except Exception as error:
        print("minecraft-launcher-lib import error:", error)

    try:
        from storage.paths import BASE_DIR, DATA_DIR, INSTANCES_DIR, INSTANCES_FILE, LOGS_DIR
        _print("Paths")
        print("BASE_DIR:", BASE_DIR)
        print("DATA_DIR:", DATA_DIR)
        print("INSTANCES_DIR:", INSTANCES_DIR)
        print("INSTANCES_FILE:", INSTANCES_FILE)
        print("LOGS_DIR:", LOGS_DIR)
    except Exception:
        _print("Paths error", traceback.format_exc())
        return

    try:
        from core.java_manager import find_java_candidates, get_java_major_version
        _print("Java")
        candidates = find_java_candidates()
        if not candidates:
            print("Java не найдена")
        for candidate in candidates:
            print(f"Java {get_java_major_version(str(candidate))}: {candidate}")
    except Exception:
        _print("Java error", traceback.format_exc())

    try:
        from storage.json_store import load_json
        _print("Instances")
        data = load_json(INSTANCES_FILE, {"instances": []})
        instances = data.get("instances", [])
        print("Count:", len(instances))
        for instance in instances:
            print("-")
            print("  name:", instance.get("name"))
            print("  minecraft_version:", instance.get("minecraft_version"))
            print("  loader:", instance.get("loader"))
            print("  path:", instance.get("path"))
            print("  minecraft_dir:", instance.get("minecraft_dir"))
            mods_dir = Path(instance.get("minecraft_dir", "")) / "mods"
            jar_count = len(list(mods_dir.glob("*.jar"))) if mods_dir.exists() else 0
            print("  mods_dir:", mods_dir, f"({jar_count} .jar)")
            versions_dir = Path(instance.get("minecraft_dir", "")) / "versions"
            if versions_dir.exists():
                versions = sorted(p.name for p in versions_dir.iterdir() if p.is_dir())
                print("  versions:", ", ".join(versions[-8:]) if versions else "—")
    except Exception:
        _print("Instances error", traceback.format_exc())

    try:
        _print("Downloads state")
        downloads = DATA_DIR / "downloads.json"
        if downloads.exists():
            data = json.loads(downloads.read_text(encoding="utf-8"))
            tasks = data.get("tasks", [])
            print("Tasks:", len(tasks))
            for task in tasks[:10]:
                print(f"- {task.get('state')} {task.get('progress')}% | {task.get('title')} | {task.get('status')} | {task.get('error') or ''}")
        else:
            print("downloads.json не найден")
    except Exception:
        _print("Downloads error", traceback.format_exc())

    try:
        _print("Latest log tail")
        latest = LOGS_DIR / "latest.log"
        if latest.exists():
            print(_tail(latest, 120))
        else:
            print("latest.log не найден")
    except Exception:
        _print("Log error", traceback.format_exc())


if __name__ == "__main__":
    run_diagnostics()
