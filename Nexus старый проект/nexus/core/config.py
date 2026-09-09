from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from nexus.version import CODENAME, VERSION


@dataclass
class NexusConfig:
    version: str = VERSION
    codename: str = CODENAME
    runtime_mode: str = "ultimate"
    agents_enabled: bool = True
    memory_enabled: bool = True
    sandbox_enabled: bool = True
    model_routing: str = "adaptive"
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path | None = None) -> NexusConfig:
        candidates = []
        if path:
            candidates.append(path)
        candidates.extend([Path("nexus.yaml"), Path(".nexus/config.yaml")])

        for candidate in candidates:
            if candidate.exists():
                with candidate.open(encoding="utf-8") as handle:
                    data = yaml.safe_load(handle) or {}
                return cls.from_dict(data)

        return cls()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> NexusConfig:
        runtime = data.get("runtime", {})
        agents = data.get("agents", {})
        memory = data.get("memory", {})
        security = data.get("security", {})
        models = data.get("models", {})

        known_keys = {"version", "runtime", "agents", "memory", "security", "models", "mode"}
        extra = {key: value for key, value in data.items() if key not in known_keys}

        return cls(
            version=str(data.get("version", VERSION)),
            codename=CODENAME,
            runtime_mode=str(runtime.get("mode", data.get("mode", "ultimate"))),
            agents_enabled=bool(agents.get("enabled", data.get("agents") == "enabled" or True)),
            memory_enabled=bool(memory.get("enabled", True)),
            sandbox_enabled=bool(security.get("sandbox", True)),
            model_routing=str(models.get("routing", "adaptive")),
            extra=extra,
        )
