from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEBSITE_DIR = ROOT / "website"


def read_app_version() -> str:
    text = (ROOT / "core" / "app_info.py").read_text(encoding="utf-8")
    match = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', text)
    if not match:
        raise RuntimeError("APP_VERSION not found in core/app_info.py")
    return match.group(1)


def normalize_version(value: str | None) -> str:
    value = (value or "").strip()
    value = value.removeprefix("refs/tags/")
    value = value.removeprefix("v")
    return value or read_app_version()


def normalize_repo(value: str | None) -> str:
    value = (value or "").strip()
    if "/" in value:
        return value
    owner = os.environ.get("GITHUB_REPOSITORY_OWNER") or "dabstebplay2-jpg"
    repo = os.environ.get("GITHUB_REPOSITORY", "").split("/")[-1] or "Nexus_mincraft_laucher"
    return f"{owner}/{repo}"


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_index(version: str, repo: str):
    path = WEBSITE_DIR / "index.html"
    if not path.exists():
        return

    text = path.read_text(encoding="utf-8")

    display_version = version
    text = re.sub(r'(id="versionText">)[^<]+', rf"\g<1>{display_version}", text)
    text = re.sub(r'(id="versionStat">)[^<]+', rf"\g<1>{display_version}", text)
    text = re.sub(r'(id="footerVersion">)[^<]+', rf"\g<1>{display_version}", text)

    text = re.sub(
        r'NexusLauncherSetup-\d+\.\d+\.\d+(?:\.\d+)?-win-x64\.exe',
        f"NexusLauncherSetup-{version}-win-x64.exe",
        text,
    )
    text = re.sub(
        r'NexusLauncher-\d+\.\d+\.\d+(?:\.\d+)?-win-x64-portable\.zip',
        f"NexusLauncher-{version}-win-x64-portable.zip",
        text,
    )
    text = re.sub(r'window\.NEXUS_VERSION\s*=\s*"[^"]+";', f'window.NEXUS_VERSION = "{version}";', text)

    text = re.sub(
        r"<title>Nexus Launcher [^<]+</title>",
        f"<title>Nexus Launcher {version} — Minecraft лаунчер для Windows</title>",
        text,
    )
    text = re.sub(
        r'<meta name="description" content="Nexus Launcher [^"]+"',
        (
            f'<meta name="description" content="Nexus Launcher {version} — стабильный '
            "Minecraft-лаунчер для Windows. Сборки, моды, шейдеры, ресурспаки, Ely.by, "
            'Discord Rich Presence, installer и portable ZIP."'
        ),
        text,
    )
    text = re.sub(
        r'(<b id="releaseStatus">)[^<]+(</b>)',
        rf"\g<1>Стабильный релиз {version}\g<2>",
        text,
    )

    if "roadmap-item--current" in text:
        text = re.sub(
            r'(<article class="roadmap-item roadmap-item--current">\s*<time>)[^<]+(</time>)',
            rf"\g<1>v{version}\g<2>",
            text,
            count=1,
        )
        text = re.sub(
            r'(<article class="roadmap-item roadmap-item--current">[\s\S]*?<b>)[^<]+(</b>)',
            rf"\g<1>v{version} — полировка UX\g<2>",
            text,
            count=1,
        )

    if "window.NEXUS_REPO" in text:
        text = re.sub(r'window\.NEXUS_REPO\s*=\s*"[^"]+";', f'window.NEXUS_REPO = "{repo}";', text)
    else:
        text = text.replace(
            f'window.NEXUS_VERSION = "{version}";',
            f'window.NEXUS_VERSION = "{version}";\n    window.NEXUS_REPO = "{repo}";',
        )

    path.write_text(text, encoding="utf-8")


def patch_script(version: str, repo: str):
    path = WEBSITE_DIR / "script.js"
    if not path.exists():
        return

    text = path.read_text(encoding="utf-8")
    text = re.sub(
        r'const repo\s*=\s*window\.NEXUS_REPO\s*\|\|\s*"[^"]+";',
        f'const repo = window.NEXUS_REPO || "{repo}";',
        text,
    )
    text = re.sub(
        r'const fallbackVersion\s*=\s*window\.NEXUS_VERSION\s*\|\|\s*"[^"]+";',
        f'const fallbackVersion = window.NEXUS_VERSION || "{version}";',
        text,
    )
    path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default=os.environ.get("NEXUS_VERSION") or os.environ.get("GITHUB_REF_NAME"))
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    args = parser.parse_args()

    version = normalize_version(args.version)
    repo = normalize_repo(args.repo)
    base = f"https://github.com/{repo}/releases/latest/download"

    installer = f"NexusLauncherSetup-{version}-win-x64.exe"
    portable = f"NexusLauncher-{version}-win-x64-portable.zip"

    data = {
        "repo": repo,
        "version": version,
        "channel": "stable",
        "installer": f"{base}/{installer}",
        "portable": f"{base}/{portable}",
        "latest_release_api": f"https://api.github.com/repos/{repo}/releases/latest",
        "latest_release_page": f"https://github.com/{repo}/releases/latest",
        "direct_download": f"{base}/{installer}",
        "portable_download": f"{base}/{portable}",
        "installer_filename": installer,
        "portable_filename": portable,
        "platform": "windows-x64",
        "download_mode": "github-release-latest-download",
        "site_quality": "auto-deploy-latest-release",
    }

    write_json(WEBSITE_DIR / "release.json", data)
    write_json(
        WEBSITE_DIR / "downloads" / "release.json",
        {
            "version": version,
            "channel": "stable",
            "repo": repo,
            "installer": data["installer"],
            "portable": data["portable"],
            "filename": installer,
            "download_url": data["direct_download"],
            "portable_filename": portable,
            "portable_download_url": data["portable_download"],
            "platform": "windows-x64",
            "source": "github-releases",
        },
    )
    patch_index(version, repo)
    patch_script(version, repo)

    print(f"Generated website release metadata for {repo} v{version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
