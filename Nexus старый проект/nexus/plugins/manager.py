from __future__ import annotations

from nexus.plugins.loader import PluginLoader


class PluginManager:
    def __init__(self):
        self._loader = PluginLoader()

    def register(self, plugin: dict) -> bool:
        self._loader.register(plugin)
        return True

    def list(self) -> list:
        return list(self._loader.plugins)

    def count(self) -> int:
        return len(self._loader.plugins)
