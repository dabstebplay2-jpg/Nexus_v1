import json
import logging
import os
import threading

from core.system_info import clamp_ram_mb, get_recommended_ram_mb

try:
    from storage.paths import DATA_DIR
except Exception:
    from pathlib import Path
    DATA_DIR = Path.cwd() / "data"


logger = logging.getLogger(__name__)

SETTINGS_FILE = DATA_DIR / "launcher_settings.json"
DEFAULT_DISCORD_CLIENT_ID = os.environ.get("NEXUS_DISCORD_CLIENT_ID", "").strip()


UI_LAYOUT_VERSION = 2


class LauncherSettings:
    def __init__(self):
        self._lock = threading.RLock()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.data = self.load()
        self._migrate_layout()

    def default_settings(self):
        return {
            "ram_mb": get_recommended_ram_mb(),
            "ram_override_enabled": True,
            "sync_ram_to_instances": True,
            "theme": "dark",
            "language": "ru",
            "sidebar_collapsed": False,
            "mods_filters_collapsed": True,
            "library_header_collapsed": False,
            "downloads_header_collapsed": False,
            "minecraft_resolution_enabled": False,
            "minecraft_resolution_width": 1280,
            "minecraft_resolution_height": 720,
            "discord_presence_enabled": True,
            "discord_client_id": DEFAULT_DISCORD_CLIENT_ID,
            "ui_layout_version": UI_LAYOUT_VERSION,
        }

    def _migrate_layout(self):
        with self._lock:
            current = int(self.data.get("ui_layout_version", 0) or 0)
            if current >= UI_LAYOUT_VERSION:
                return
            self.data["sidebar_collapsed"] = False
            self.data["ui_layout_version"] = UI_LAYOUT_VERSION
            self.save()

    def load(self):
        with self._lock:
            if not SETTINGS_FILE.exists():
                return self.default_settings()

            try:
                raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))

                data = self.default_settings()
                data.update(raw)
                data["ram_mb"] = clamp_ram_mb(data.get("ram_mb", get_recommended_ram_mb()))
                data["minecraft_resolution_width"] = self._clamp_resolution_value(
                    data.get("minecraft_resolution_width", 1280),
                    default=1280,
                    min_value=320,
                    max_value=7680,
                )
                data["minecraft_resolution_height"] = self._clamp_resolution_value(
                    data.get("minecraft_resolution_height", 720),
                    default=720,
                    min_value=240,
                    max_value=4320,
                )
                data["minecraft_resolution_enabled"] = bool(data.get("minecraft_resolution_enabled", False))
                data["discord_presence_enabled"] = bool(data.get("discord_presence_enabled", False))
                data["discord_client_id"] = str(data.get("discord_client_id", "") or "").strip()

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

    def is_sidebar_collapsed(self):
        with self._lock:
            return bool(self.data.get("sidebar_collapsed", False))

    def set_sidebar_collapsed(self, collapsed):
        with self._lock:
            self.data["sidebar_collapsed"] = bool(collapsed)
            self.save()

    def is_library_header_collapsed(self):
        with self._lock:
            return bool(self.data.get("library_header_collapsed", False))

    def set_library_header_collapsed(self, collapsed):
        with self._lock:
            self.data["library_header_collapsed"] = bool(collapsed)
            self.save()

    def is_downloads_header_collapsed(self):
        with self._lock:
            return bool(self.data.get("downloads_header_collapsed", False))

    def set_downloads_header_collapsed(self, collapsed):
        with self._lock:
            self.data["downloads_header_collapsed"] = bool(collapsed)
            self.save()


    def _clamp_resolution_value(self, value, default=1280, min_value=320, max_value=7680):
        try:
            value = int(value)
        except Exception:
            value = int(default)

        return max(int(min_value), min(int(max_value), value))

    def is_minecraft_resolution_enabled(self):
        with self._lock:
            return bool(self.data.get("minecraft_resolution_enabled", False))

    def set_minecraft_resolution_enabled(self, enabled):
        with self._lock:
            self.data["minecraft_resolution_enabled"] = bool(enabled)
            self.save()
            return self.data["minecraft_resolution_enabled"]

    def get_minecraft_resolution(self):
        with self._lock:
            width = self._clamp_resolution_value(
                self.data.get("minecraft_resolution_width", 1280),
                default=1280,
                min_value=320,
                max_value=7680,
            )
            height = self._clamp_resolution_value(
                self.data.get("minecraft_resolution_height", 720),
                default=720,
                min_value=240,
                max_value=4320,
            )
            return width, height

    def set_minecraft_resolution(self, width, height, enabled=None):
        with self._lock:
            self.data["minecraft_resolution_width"] = self._clamp_resolution_value(
                width,
                default=1280,
                min_value=320,
                max_value=7680,
            )
            self.data["minecraft_resolution_height"] = self._clamp_resolution_value(
                height,
                default=720,
                min_value=240,
                max_value=4320,
            )

            if enabled is not None:
                self.data["minecraft_resolution_enabled"] = bool(enabled)

            self.save()
            return (
                self.data["minecraft_resolution_width"],
                self.data["minecraft_resolution_height"],
            )


    def is_discord_presence_enabled(self):
        with self._lock:
            return bool(self.data.get("discord_presence_enabled", False))

    def set_discord_presence_enabled(self, enabled):
        with self._lock:
            self.data["discord_presence_enabled"] = bool(enabled)
            self.save()
            return self.data["discord_presence_enabled"]

    def get_discord_client_id(self):
        with self._lock:
            return str(self.data.get("discord_client_id", "") or DEFAULT_DISCORD_CLIENT_ID).strip()

    def set_discord_client_id(self, client_id):
        with self._lock:
            self.data["discord_client_id"] = str(client_id or "").strip()
            self.save()
            return self.data["discord_client_id"]

    def set_discord_presence_settings(self, enabled, client_id):
        with self._lock:
            self.data["discord_presence_enabled"] = bool(enabled)
            self.data["discord_client_id"] = str(client_id or DEFAULT_DISCORD_CLIENT_ID).strip()
            self.save()
            return {
                "enabled": self.data["discord_presence_enabled"],
                "client_id": self.data["discord_client_id"],
            }


_launcher_settings = LauncherSettings()
_settings_lock = threading.Lock()


def get_launcher_settings():
    return _launcher_settings
