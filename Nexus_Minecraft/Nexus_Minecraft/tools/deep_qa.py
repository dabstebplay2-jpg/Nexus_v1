from __future__ import annotations

import json
import py_compile
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def ok(text):
    print(f"[OK] {text}")


def warn(text):
    print(f"[WARN] {text}")


def fail(text):
    print(f"[FAIL] {text}")


def check_py_compile():
    errors = []
    for path in ROOT.rglob("*.py"):
        if any(part in {".venv", "__pycache__", "build"} for part in path.parts):
            continue
        try:
            py_compile.compile(str(path), doraise=True)
        except Exception:
            errors.append((path.relative_to(ROOT), traceback.format_exc()))

    if errors:
        fail(f"Python compile errors: {len(errors)}")
        for path, error in errors[:10]:
            print(path)
            print(error)
        return False

    ok("Python compile: no syntax errors")
    return True


def check_required_files():
    required = [
        "main.py",
        "requirements.txt",
        "assets/nexus.ico",
        "build/NexusLauncher-OneFile.spec",
        "build/NexusLauncher-Portable.spec",
        "scripts/build_release.ps1",
        "scripts/build_installer.ps1",
        "scripts/build_full_release.ps1",
        "installer/NexusLauncher.iss",
        "website/index.html",
        "website/styles.css",
        "website/script.js",
        ".github/workflows/release.yml",
    ]

    missing = [item for item in required if not (ROOT / item).exists()]
    if missing:
        fail("Missing required files:")
        for item in missing:
            print("  -", item)
        return False

    ok("Required project files exist")
    return True


def check_runtime_not_tracked():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8", errors="ignore") if (ROOT / ".gitignore").exists() else ""
    needed = ["data/", "data_backup_before_*/", "dist/", "release/", ".venv/"]
    missing = [rule for rule in needed if rule not in gitignore]
    if missing:
        warn("Missing .gitignore rules: " + ", ".join(missing))
        return False
    ok(".gitignore protects runtime/build folders")
    return True


def check_app_info():
    ns = {}
    text = (ROOT / "core/app_info.py").read_text(encoding="utf-8-sig")
    exec(compile(text, "core/app_info.py", "exec"), ns)

    version = ns.get("APP_VERSION")
    owner = ns.get("GITHUB_OWNER")
    repo = ns.get("GITHUB_REPO")
    website = ns.get("WEBSITE_RELEASE_JSON_URL")

    if not version:
        fail("APP_VERSION is empty")
        return False

    if not owner or "YOUR_GITHUB" in str(owner):
        fail("GITHUB_OWNER is not configured")
        return False

    if not repo:
        fail("GITHUB_REPO is empty")
        return False

    ok(f"App info: version={version}, repo={owner}/{repo}")
    print(f"     website release json: {website}")
    return True


def check_website_json():
    for rel in ["website/release.json", "website/downloads/release.json"]:
        path = ROOT / rel
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            ok(f"{rel}: valid JSON, version={data.get('version')}")
        except Exception as error:
            fail(f"{rel}: {error}")
            return False
    return True


def check_full_audit():
    try:
        from tools.full_audit import collect_issues
    except Exception as error:
        fail(f"full_audit import failed: {error}")
        return False

    issues = collect_issues(include_ui=False, include_network=False)
    if issues:
        fail(f"Full audit found {len(issues)} issue(s):")
        for item in issues[:12]:
            print("  -", item)
        if len(issues) > 12:
            print(f"  ... and {len(issues) - 12} more")
        return False

    ok("Full audit: imports, theme, local loader rules, instances")
    return True


def main():
    print("=== Nexus Deep QA ===")
    print("Project:", ROOT)
    results = [
        check_required_files(),
        check_py_compile(),
        check_runtime_not_tracked(),
        check_app_info(),
        check_website_json(),
        check_full_audit(),
    ]

    print()
    if all(results):
        ok("Deep QA passed")
        return 0

    fail("Deep QA found issues")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
