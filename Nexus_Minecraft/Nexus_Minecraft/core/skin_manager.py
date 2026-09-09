from __future__ import annotations

import json
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import requests

from storage.paths import DATA_DIR
from core.constants import USER_AGENT


class SkinError(RuntimeError):
    pass


class SkinManager:
    SCHEMA_VERSION = 1

    def __init__(self, root: str | Path | None = None):
        self._lock = threading.RLock()
        self.data_dir = Path(root) / "data" if root else DATA_DIR
        self.skins_dir = self.data_dir / "skins"
        self.skins_file = self.data_dir / "skins.json"
        self.accounts_file = self.data_dir / "accounts.json"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.skins_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        if not self.skins_file.exists():
            self._save({"schema_version": self.SCHEMA_VERSION, "skins": []})

    def _load(self) -> dict[str, Any]:
        try:
            data = json.loads(self.skins_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError
        except Exception:
            data = {"schema_version": self.SCHEMA_VERSION, "skins": []}

        data.setdefault("schema_version", self.SCHEMA_VERSION)
        data.setdefault("skins", [])
        if not isinstance(data["skins"], list):
            data["skins"] = []
        return data

    def _save(self, data: dict[str, Any]) -> None:
        tmp = self.skins_file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.skins_file)

    @staticmethod
    def png_size(path: str | Path) -> tuple[int, int]:
        p = Path(path)
        raw = p.read_bytes()[:32]
        if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
            raise SkinError("Файл должен быть PNG-изображением Minecraft-скина.")
        if raw[12:16] != b"IHDR":
            raise SkinError("PNG-файл повреждён: не найден IHDR.")
        width = int.from_bytes(raw[16:20], "big")
        height = int.from_bytes(raw[20:24], "big")
        return width, height

    @staticmethod
    def validate_skin_size(width: int, height: int) -> None:
        if width < 64:
            raise SkinError("Минимальная ширина скина — 64 px.")
        if width > 1024:
            raise SkinError("Слишком большой скин. Максимум для лаунчера — 1024 px по ширине.")
        if width % 64 != 0:
            raise SkinError("Ширина скина должна быть кратна 64 px: 64, 128, 256, 512...")
        if height not in {width, width // 2}:
            raise SkinError("Формат скина должен быть 64x64/64x32 или HD-вариант с такими же пропорциями.")

    @staticmethod
    def safe_name(name: str) -> str:
        name = (name or "skin").strip()
        bad = '<>:"/\\|?*\n\r\t'
        for ch in bad:
            name = name.replace(ch, "_")
        name = " ".join(name.split())
        return name[:48] or "skin"

    def list_skins(self) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load()
            result = []
            changed = False

            for skin in data["skins"]:
                path = Path(skin.get("path", ""))
                if path.exists():
                    result.append(skin)
                else:
                    changed = True

            if changed:
                data["skins"] = result
                self._save(data)

            return result

    def get_skin(self, skin_id: str | None) -> dict[str, Any] | None:
        if not skin_id:
            return None
        for skin in self.list_skins():
            if skin.get("id") == skin_id:
                return skin
        return None

    def import_skin(self, source_path: str | Path, name: str | None = None, model: str = "auto") -> dict[str, Any]:
        with self._lock:
            src = Path(source_path)
            if not src.exists():
                raise SkinError("Файл скина не найден.")
            if src.suffix.lower() != ".png":
                raise SkinError("Скин должен быть PNG-файлом.")

            width, height = self.png_size(src)
            self.validate_skin_size(width, height)

            skin_id = str(uuid.uuid4())
            display_name = self.safe_name(name or src.stem)
            filename = f"{skin_id}.png"
            dst = self.skins_dir / filename
            shutil.copy2(src, dst)

            created = int(time.time())
            skin = {
                "id": skin_id,
                "name": display_name,
                "filename": filename,
                "path": str(dst),
                "width": width,
                "height": height,
                "model": model if model in {"auto", "classic", "slim"} else "auto",
                "created_at": created,
                "updated_at": created,
            }

            data = self._load()
            data["skins"].insert(0, skin)
            self._save(data)
            return skin

    def import_skin_from_url(self, url: str, name: str | None = None, model: str = "auto") -> dict[str, Any]:
        url = str(url or "").strip()
        if not url:
            raise SkinError("URL скина не указан.")
        if not (url.startswith("https://") or url.startswith("http://")):
            raise SkinError("URL должен начинаться с http:// или https://.")

        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
            response.raise_for_status()
        except Exception as error:
            raise SkinError(f"Не удалось скачать скин: {error}") from error

        content_type = response.headers.get("content-type", "").lower()
        if "image" not in content_type and "png" not in content_type:
            raise SkinError("Ссылка должна вести на PNG-изображение скина.")

        data = response.content or b""
        if len(data) > 4 * 1024 * 1024:
            raise SkinError("Скин слишком большой. Максимум 4 MB.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        try:
            return self.import_skin(tmp_path, name=name or Path(url.split("?")[0]).stem or "URL skin", model=model)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

    def delete_skin(self, skin_id: str) -> None:
        with self._lock:
            data = self._load()
            target = None
            kept = []

            for skin in data["skins"]:
                if skin.get("id") == skin_id:
                    target = skin
                else:
                    kept.append(skin)

            data["skins"] = kept
            self._save(data)

            if target:
                try:
                    Path(target.get("path", "")).unlink(missing_ok=True)
                except Exception:
                    pass

            self.clear_skin_from_all_accounts(skin_id)

    def _load_accounts_data(self) -> dict[str, Any]:
        try:
            data = json.loads(self.accounts_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError
        except Exception:
            data = {"schema_version": 1, "active_account_id": None, "accounts": []}

        data.setdefault("schema_version", 1)
        data.setdefault("active_account_id", None)
        data.setdefault("accounts", [])
        return data

    def _save_accounts_data(self, data: dict[str, Any]) -> None:
        self.accounts_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.accounts_file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.accounts_file)

    def set_account_skin(self, account_id: str, skin_id: str, model: str = "auto") -> dict[str, Any]:
        skin = self.get_skin(skin_id)
        if not skin:
            raise SkinError("Скин не найден в библиотеке.")

        data = self._load_accounts_data()

        for account in data.get("accounts", []):
            if account.get("id") == account_id:
                account["skin_id"] = skin_id
                account["skin_path"] = skin.get("path")
                account["skin_name"] = skin.get("name")
                account["skin_model"] = model if model in {"auto", "classic", "slim"} else skin.get("model", "auto")
                account["updated_at"] = int(time.time())
                self._save_accounts_data(data)
                return account

        raise SkinError("Аккаунт не найден.")

    def clear_account_skin(self, account_id: str) -> dict[str, Any] | None:
        data = self._load_accounts_data()

        for account in data.get("accounts", []):
            if account.get("id") == account_id:
                for key in ["skin_id", "skin_path", "skin_name", "skin_model"]:
                    account.pop(key, None)
                account["updated_at"] = int(time.time())
                self._save_accounts_data(data)
                return account

        return None

    def clear_skin_from_all_accounts(self, skin_id: str) -> None:
        data = self._load_accounts_data()
        changed = False

        for account in data.get("accounts", []):
            if account.get("skin_id") == skin_id:
                for key in ["skin_id", "skin_path", "skin_name", "skin_model"]:
                    account.pop(key, None)
                changed = True

        if changed:
            self._save_accounts_data(data)

    def get_account_skin(self, account: dict[str, Any] | None) -> dict[str, Any] | None:
        if not account:
            return None

        skin = self.get_skin(account.get("skin_id"))
        if skin:
            return skin

        path = account.get("skin_path")
        if path and Path(path).exists():
            return {
                "id": account.get("skin_id") or "external",
                "name": account.get("skin_name") or "Custom skin",
                "path": path,
                "model": account.get("skin_model") or "auto",
            }

        return None
