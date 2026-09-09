"""Encrypt/decrypt connector credentials at rest (Fernet)."""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import SECRET_KEY


def _fernet() -> Fernet:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY required for connector credentials vault")
    digest = hashlib.sha256(SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_credentials(data: dict[str, Any]) -> str:
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    return _fernet().encrypt(raw).decode("ascii")


def decrypt_credentials(blob: str) -> dict[str, Any]:
    if not blob or not blob.strip():
        return {}
    try:
        raw = _fernet().decrypt(blob.encode("ascii"))
        return json.loads(raw.decode("utf-8"))
    except (InvalidToken, json.JSONDecodeError, ValueError):
        return {}


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(blob: str) -> str | None:
    if not blob or not blob.strip():
        return None
    try:
        return _fernet().decrypt(blob.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
