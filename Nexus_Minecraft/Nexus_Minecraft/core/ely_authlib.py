from __future__ import annotations

import hashlib
from pathlib import Path

import requests

from core.constants import USER_AGENT
from storage.paths import DATA_DIR


LATEST_METADATA_URL = "https://authlib-injector.yushi.moe/artifact/latest.json"
AUTHLIB_DIR = DATA_DIR / "authlib-injector"
AUTHLIB_JAR = AUTHLIB_DIR / "authlib-injector.jar"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_authlib_injector(timeout: int = 20) -> Path:
    """Download and verify authlib-injector for Ely.by launch if needed."""

    AUTHLIB_DIR.mkdir(parents=True, exist_ok=True)

    metadata = requests.get(
        LATEST_METADATA_URL,
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    metadata.raise_for_status()
    payload = metadata.json()

    download_url = payload.get("download_url")
    expected_sha256 = (payload.get("checksums") or {}).get("sha256")

    if not download_url:
        raise RuntimeError("authlib-injector не вернул ссылку на скачивание.")

    if AUTHLIB_JAR.exists() and expected_sha256:
        if _sha256(AUTHLIB_JAR).lower() == str(expected_sha256).lower():
            return AUTHLIB_JAR

    response = requests.get(
        download_url,
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    response.raise_for_status()

    tmp = AUTHLIB_JAR.with_suffix(".jar.tmp")
    tmp.write_bytes(response.content)

    if expected_sha256 and _sha256(tmp).lower() != str(expected_sha256).lower():
        tmp.unlink(missing_ok=True)
        raise RuntimeError("authlib-injector скачался, но SHA-256 не совпал.")

    tmp.replace(AUTHLIB_JAR)
    return AUTHLIB_JAR


def build_ely_javaagent_argument(jar_path: str | Path) -> str:
    return f"-javaagent:{Path(jar_path)}=ely.by"
