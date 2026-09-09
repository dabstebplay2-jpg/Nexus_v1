"""Full project audit — imports, themes, loaders, instances, UI smoke test."""
from __future__ import annotations

import argparse
import importlib
import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def audit_imports() -> list[str]:
    issues = []
    skip = {".venv", "__pycache__", "build", "dist", "release"}
    for path in ROOT.rglob("*.py"):
        if any(p in path.parts for p in skip):
            continue
        mod = str(path.relative_to(ROOT).with_suffix("")).replace("\\", ".").replace("/", ".")
        if mod.endswith(".__init__"):
            mod = mod[:-9]
        try:
            importlib.import_module(mod)
        except Exception as exc:
            issues.append(f"{mod}: {exc}")
    return issues


def audit_loader_api() -> list[str]:
    issues = []
    from core.loader_manager import get_loader_manager

    mgr = get_loader_manager()
    cases = {
        "fabric": "1.20.1",
        "forge": "1.20.1",
        "neoforge": "1.20.2",
        "quilt": "1.20.1",
    }
    for loader, mc in cases.items():
        try:
            versions = mgr.fetch_loader_versions(loader, mc)
            if not versions:
                issues.append(f"{loader}: no versions for {mc}")
            else:
                err = mgr.validate_loader_selection(loader, mc, versions[0])
                if err:
                    issues.append(f"{loader}: validate failed for latest: {err}")
        except Exception as exc:
            issues.append(f"{loader}: {exc}")

    if not mgr.get_known_unsupported_message("neoforge", "1.20.1"):
        issues.append("neoforge: 1.20.1 should be blocked with a clear message")
    return issues


def audit_loader_rules() -> list[str]:
    issues = []
    from core.loader_manager import get_loader_manager

    mgr = get_loader_manager()
    local_cases = [
        ("fabric", "1.12.2"),
        ("quilt", "1.12.2"),
        ("neoforge", "1.20.1"),
    ]

    for loader, mc in local_cases:
        if not mgr.get_known_unsupported_message(loader, mc):
            issues.append(f"{loader}: {mc} should be blocked locally")

    for loader in ("vanilla", "fabric-loader", "neo forge", "neo-forge", "quilt-loader"):
        try:
            normalized = mgr.normalize_loader_id(loader)
        except Exception as exc:
            issues.append(f"{loader}: normalize failed: {exc}")
            continue

        if not normalized:
            issues.append(f"{loader}: normalize returned empty value")

    return issues


def audit_instances() -> list[str]:
    issues = []
    from core.loader_manager import get_loader_manager
    from storage.json_store import load_json
    from storage.paths import INSTANCES_FILE

    mgr = get_loader_manager()
    data = load_json(INSTANCES_FILE, {"instances": []})
    for inst in data.get("instances", []):
        name = inst.get("name", "?")
        loader = inst.get("loader", "vanilla")
        mc = inst.get("minecraft_version", "")
        lv = inst.get("loader_version") or ""
        mc_dir = Path(inst.get("minecraft_dir", ""))
        if not mc_dir.exists():
            issues.append(f"instance '{name}': minecraft_dir missing: {mc_dir}")
        err = mgr.validate_loader_selection(loader, mc, lv)
        if err:
            issues.append(f"instance '{name}': {err}")
    return issues


def audit_theme() -> list[str]:
    issues = []
    from storage.paths import DATA_DIR
    from ui.styles import THEME_OPTIONS, get_app_style

    settings_file = DATA_DIR / "launcher_settings.json"
    if settings_file.exists():
        try:
            json.loads(settings_file.read_text(encoding="utf-8"))
        except Exception as exc:
            issues.append(f"launcher_settings.json parse error: {exc}")

    for theme in tuple(theme_id for theme_id, _label in THEME_OPTIONS) + ("light",):
        try:
            css = get_app_style(theme)
            if len(css) < 1000:
                issues.append(f"theme '{theme}': stylesheet too short ({len(css)} bytes)")
        except Exception as exc:
            issues.append(f"theme '{theme}': {exc}")
    return issues


def audit_ui_headless() -> list[str]:
    issues = []
    try:
        from PySide6.QtWidgets import QApplication

        app = QApplication.instance() or QApplication([])
        from ui.styles import get_app_style

        app.setStyleSheet(get_app_style("dark"))
        from app.window import MainWindow

        win = MainWindow()
        for idx in range(win.pages.count()):
            try:
                win.pages.setCurrentIndex(idx)
                app.processEvents()
            except Exception as exc:
                issues.append(f"page index {idx}: {exc}")
        win.close()
    except Exception as exc:
        issues.append(f"UI headless: {exc}")
    return issues


def collect_issues(*, include_ui: bool = True, include_network: bool = True) -> list[str]:
    all_issues: list[str] = []
    checks = [
        ("imports", audit_imports),
        ("theme", audit_theme),
        ("loader_api", audit_loader_api if include_network else audit_loader_rules),
        ("instances", audit_instances),
    ]
    if include_ui:
        checks.append(("ui_headless", audit_ui_headless))

    for name, fn in checks:
        try:
            all_issues.extend(fn())
        except Exception:
            all_issues.append(f"{name}: crash:\n{traceback.format_exc()}")
    return all_issues


def run_audit(*, include_ui: bool = True, include_network: bool = True, verbose: bool = True) -> int:
    if verbose:
        print("=== Nexus Full Audit ===")

    checks = [
        ("imports", audit_imports),
        ("theme", audit_theme),
        ("loader_api", audit_loader_api if include_network else audit_loader_rules),
        ("instances", audit_instances),
    ]
    if include_ui:
        checks.append(("ui_headless", audit_ui_headless))

    all_issues: list[str] = []
    for name, fn in checks:
        if verbose:
            print(f"\n--- {name} ---")
        try:
            found = fn()
            all_issues.extend(found)
            if verbose:
                if found:
                    for item in found:
                        print(f"[ISSUE] {item}")
                else:
                    print("[OK]")
        except Exception:
            msg = traceback.format_exc()
            all_issues.append(f"{name}: crash:\n{msg}")
            if verbose:
                print(f"[CRASH] {name}\n{msg}")

    if verbose:
        print(f"\n=== Total issues: {len(all_issues)} ===")

    return 1 if all_issues else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-network",
        action="store_true",
        help="Skip external loader API checks and run only local loader rules.",
    )
    parser.add_argument(
        "--skip-ui",
        action="store_true",
        help="Skip the PySide6 headless UI smoke test.",
    )
    args = parser.parse_args()

    return run_audit(
        include_ui=not args.skip_ui,
        include_network=not args.skip_network,
    )


if __name__ == "__main__":
    raise SystemExit(main())
