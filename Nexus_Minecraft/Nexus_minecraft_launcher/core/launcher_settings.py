import json
import logging
import threading

from core.system_info import clamp_ram_mb, get_recommended_ram_mb

try:
    from storage.paths import DATA_DIR
except Exception:
    from pathlib import Path
    DATA_DIR = Path.cwd() / "data"


logger = logging.getLogger(__name__)

SETTINGS_FILE = DATA_DIR / "launcher_settings.json"


class LauncherSettings:
    def __init__(self):
        self._lock = threading.RLock()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.data = self.load()

    def default_settings(self):
        return {
            "ram_mb": get_recommended_ram_mb(),
            "ram_override_enabled": True,
            "sync_ram_to_instances": True,
            "theme": "dark",
            "language": "ru",
            "mods_filters_collapsed": True,
        }

    def load(self):
        with self._lock:
            if not SETTINGS_FILE.exists():
                return self.default_settings()

            try:
                raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))

                data = self.default_settings()
                data.update(raw)
                data["ram_mb"] = clamp_ram_mb(data.get("ram_mb", get_recommended_ram_mb()))

                return data
            except Exception:
                logger.exception("Failed to load launcher settings")
                return self.default_settings()

    def save(self):
        with self._lock:
            DATA_DIR.mkdir(parents=True, exist_ok=True)

            tmp = SETTINGS_FILE.with_suffix(".json.tmp")
            tmp.write_text(
                json.dumps(self.data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            tmp.replace(SETTINGS_FILE)

    def get_ram_mb(self, default=None):
        with self._lock:
            value = self.data.get("ram_mb", default or get_recommended_ram_mb())
            return clamp_ram_mb(value)

    def set_ram_mb(self, value):
        with self._lock:
            self.data["ram_mb"] = clamp_ram_mb(value)
            self.save()
            return self.data["ram_mb"]

    def is_ram_override_enabled(self):
        with self._lock:
            return bool(self.data.get("ram_override_enabled", True))

    def set_ram_override_enabled(self, enabled):
        with self._lock:
            self.data["ram_override_enabled"] = bool(enabled)
            self.save()

    def sync_ram_to_instances_enabled(self):
        with self._lock:
            return bool(self.data.get("sync_ram_to_instances", True))

    def set_sync_ram_to_instances(self, enabled):
        with self._lock:
            self.data["sync_ram_to_instances"] = bool(enabled)
            self.save()


    def get_theme(self):
        with self._lock:
            return str(self.data.get("theme", "dark"))

    def set_theme(self, theme):
        with self._lock:
            self.data["theme"] = str(theme or "dark")
            self.save()
            return self.data["theme"]

    def get_mods_filters_collapsed(self):
        with self._lock:
            return bool(self.data.get("mods_filters_collapsed", True))

    def set_mods_filters_collapsed(self, collapsed):
        with self._lock:
            self.data["mods_filters_collapsed"] = bool(collapsed)
            self.save()


_launcher_settings = LauncherSettings()
_settings_lock = threading.Lock()


def get_launcher_settings():
    return _launcher_settings
