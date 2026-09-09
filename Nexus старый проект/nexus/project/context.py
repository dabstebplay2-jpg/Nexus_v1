"""Canonical project context passed into Orchestra planning."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class ProjectContext:
    root: str
    language: str = "Unknown"
    framework: str = "Unknown"
    build: str = "Unknown"
    files: int = 0
    dependencies: list[str] = field(default_factory=list)
    structure: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        return (
            f"{self.framework} / {self.language}; build={self.build}; "
            f"files={self.files}"
        )


__all__ = ["ProjectContext"]
