from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from nexus.core.state import SystemState


@dataclass
class NexusKernel:
    state: SystemState = SystemState.OFFLINE
    services: dict[str, Any] = field(default_factory=dict)

    def register(self, name: str, service: Any) -> None:
        self.services[name] = service

    def get(self, name: str) -> Any | None:
        return self.services.get(name)

    async def boot(self) -> None:
        self.state = SystemState.BOOTING
        self.state = SystemState.ONLINE

    async def shutdown(self) -> None:
        self.state = SystemState.SHUTTING_DOWN
        self.state = SystemState.OFFLINE

    def status(self) -> dict[str, Any]:
        return {
            "state": self.state.value,
            "services": sorted(self.services.keys()),
        }
