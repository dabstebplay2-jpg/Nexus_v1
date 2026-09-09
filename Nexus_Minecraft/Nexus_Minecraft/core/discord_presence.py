from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from core.launcher_settings import get_launcher_settings

logger = logging.getLogger(__name__)


@dataclass
class PresenceState:
    mode: str = "idle"
    details: str = "В Nexus Launcher"
    state: str = "Выбирает сборку"
    large_text: str = "Nexus Minecraft Launcher"
    start_time: int = field(default_factory=lambda: int(time.time()))


class DiscordPresenceManager:
    """Small, optional wrapper around pypresence.

    Discord Rich Presence requires a Discord Application Client ID. Nexus does
    not hardcode a private ID; user can paste one in Settings. If pypresence is
    missing or Discord is closed, the launcher keeps working silently.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._rpc = None
        self._connected_client_id: Optional[str] = None
        self._state = PresenceState()
        self._last_error = ""
        self._last_update = 0.0
        self._last_payload_signature = None
        self._game_active = False

    def available(self) -> bool:
        try:
            import pypresence  # noqa: F401
            return True
        except Exception:
            return False

    def last_error(self) -> str:
        with self._lock:
            return self._last_error

    def configured(self) -> bool:
        settings = get_launcher_settings()
        return bool(settings.is_discord_presence_enabled() and settings.get_discord_client_id())

    def connect(self) -> bool:
        settings = get_launcher_settings()
        if not settings.is_discord_presence_enabled():
            self.close()
            return False

        client_id = settings.get_discord_client_id()
        if not client_id:
            self._set_error("Discord Client ID не указан.")
            self.close()
            return False

        with self._lock:
            if self._rpc and self._connected_client_id == client_id:
                return True

            self.close()

            try:
                from pypresence import Presence
                self._rpc = Presence(client_id)
                self._rpc.connect()
                self._connected_client_id = client_id
                self._last_error = ""
                logger.info("Discord Rich Presence connected")
                return True
            except Exception as error:
                self._rpc = None
                self._connected_client_id = None
                self._set_error(str(error))
                logger.info("Discord Rich Presence unavailable: %s", error)
                return False

    def _set_error(self, message: str):
        with self._lock:
            self._last_error = str(message or "")

    def _clip(self, value: object, limit: int = 128) -> str:
        text = str(value or "").strip()
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 1)].rstrip() + "…"

    def _update(self, state: PresenceState, *, force: bool = False):
        with self._lock:
            self._state = state

        if not self.connect():
            return False

        with self._lock:
            try:
                now = time.time()
                signature = (
                    state.mode,
                    state.details,
                    state.state,
                    state.large_text,
                    state.start_time,
                )
                # Avoid hammering Discord pipe while UI changes quickly.
                if not force and signature == self._last_payload_signature and now - self._last_update < 2.0:
                    return True

                payload = {
                    "details": self._clip(state.details),
                    "state": self._clip(state.state),
                    "start": state.start_time,
                    "large_text": self._clip(state.large_text),
                    # These image keys work if the user's Discord application has
                    # matching assets. If not, Discord just shows text.
                    "large_image": "nexus",
                }

                self._rpc.update(**payload)
                self._last_update = now
                self._last_payload_signature = signature
                self._last_error = ""
                return True
            except Exception as error:
                self._set_error(str(error))
                logger.debug("Discord Rich Presence update failed", exc_info=True)
                self.close()
                return False

    def set_launcher_idle(self, page: str = "Главная") -> bool:
        with self._lock:
            if self._game_active:
                return True

        return self._update(PresenceState(
            mode="idle",
            details="В Nexus Launcher",
            state=f"Раздел: {page}",
            large_text="Nexus Minecraft Launcher",
            start_time=int(time.time()),
        ))

    def set_browsing_mods(self) -> bool:
        with self._lock:
            if self._game_active:
                return True

        return self._update(PresenceState(
            mode="mods",
            details="Ищет моды и шейдеры",
            state="Каталог Modrinth",
            large_text="Nexus Mods Catalog",
            start_time=int(time.time()),
        ))

    def set_launching(self, instance: dict) -> bool:
        name = self._clip(instance.get("name", "Minecraft"))
        version = self._clip(instance.get("minecraft_version", "unknown"), 64)
        loader = self._clip(instance.get("loader", "vanilla"), 64)

        with self._lock:
            self._game_active = True

        return self._update(
            PresenceState(
                mode="launching",
                details=f"Запускает: {name}",
                state=f"Minecraft {version} • {loader}",
                large_text="Launching Minecraft through Nexus",
                start_time=int(time.time()),
            ),
            force=True,
        )

    def set_playing(self, instance: dict) -> bool:
        name = self._clip(instance.get("name", "Minecraft"))
        version = self._clip(instance.get("minecraft_version", "unknown"), 64)
        loader = self._clip(instance.get("loader", "vanilla"), 64)

        with self._lock:
            self._game_active = True

        return self._update(
            PresenceState(
                mode="playing",
                details=f"Играет: {name}",
                state=f"Minecraft {version} • {loader}",
                large_text="Playing Minecraft through Nexus",
                start_time=int(time.time()),
            ),
            force=True,
        )

    def set_minecraft_closed(self, page: str = "Minecraft закрыт") -> bool:
        with self._lock:
            self._game_active = False

        return self._update(
            PresenceState(
                mode="idle",
                details="В Nexus Launcher",
                state=page,
                large_text="Nexus Minecraft Launcher",
                start_time=int(time.time()),
            ),
            force=True,
        )

    def close(self):
        with self._lock:
            rpc = self._rpc
            self._rpc = None
            self._connected_client_id = None
            self._last_payload_signature = None
            self._game_active = False

        if rpc:
            try:
                rpc.close()
            except Exception:
                pass


_manager = DiscordPresenceManager()


def discord_presence() -> DiscordPresenceManager:
    return _manager
