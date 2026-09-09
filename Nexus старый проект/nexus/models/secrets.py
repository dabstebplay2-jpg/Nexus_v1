"""Secure API key storage for model providers."""

from __future__ import annotations

import base64
import ctypes
import os
from pathlib import Path

import yaml

DEFAULT_SECRETS_PATH = Path(".nexus/secrets.yaml")


class SecretStore:
    """Stores API keys outside config, protected by Windows DPAPI when available."""

    def __init__(self, path: Path | None = None):
        self.path = path or DEFAULT_SECRETS_PATH

    def protection_method(self) -> str:
        if os.name == "nt":
            return "Windows DPAPI encrypted storage (Current User)"
        return "restricted user-only storage (mode 0600)"

    def storage_location(self) -> Path:
        return self.path.expanduser().resolve()

    def _load(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        with self.path.open(encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
        return {
            str(key): self._unprotect(str(value))
            for key, value in data.get("keys", {}).items()
        }

    def _save(self, keys: dict[str, str]) -> Path:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as handle:
            protected = {key: self._protect(value) for key, value in keys.items()}
            yaml.safe_dump(
                {"version": 2, "keys": protected},
                handle,
                default_flow_style=False,
                sort_keys=False,
            )
        try:
            self.path.chmod(0o600)
        except OSError:
            pass
        return self.path

    @staticmethod
    def _protect(value: str) -> str:
        if os.name != "nt":
            return "restricted:" + base64.b64encode(value.encode("utf-8")).decode("ascii")
        encrypted = _windows_protect(value.encode("utf-8"))
        return "dpapi:" + base64.b64encode(encrypted).decode("ascii")

    @staticmethod
    def _unprotect(value: str) -> str:
        if value.startswith("dpapi:"):
            payload = base64.b64decode(value[6:])
            return _windows_unprotect(payload).decode("utf-8")
        if value.startswith("restricted:"):
            return base64.b64decode(value[11:]).decode("utf-8")
        # V6 plaintext secrets are accepted and rewritten securely on next save.
        return value

    def set(self, ref: str, api_key: str) -> None:
        keys = self._load()
        keys[ref] = api_key
        self._save(keys)

    def get(self, ref: str) -> str | None:
        return self._load().get(ref)

    def delete(self, ref: str) -> bool:
        keys = self._load()
        if ref not in keys:
            return False
        del keys[ref]
        self._save(keys)
        return True

    def list_refs(self) -> list[str]:
        return sorted(self._load().keys())

    def has(self, ref: str) -> bool:
        return ref in self._load()


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_ulong), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _blob(data: bytes):
    buffer = ctypes.create_string_buffer(data)
    blob = _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    return blob, buffer


def _windows_protect(data: bytes) -> bytes:
    source, source_buffer = _blob(data)
    target = _DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(source), "Nexus", None, None, None, 0, ctypes.byref(target)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.pbData, target.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)


def _windows_unprotect(data: bytes) -> bytes:
    source, source_buffer = _blob(data)
    target = _DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, 0, ctypes.byref(target)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.pbData, target.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)


SecureKeyStore = SecretStore

__all__ = ["SecretStore", "SecureKeyStore"]
