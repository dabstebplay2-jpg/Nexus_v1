"""Execution state for an Orchestra run."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from nexus.orchestra.artifacts import ArtifactStore
from nexus.orchestra.graph import TaskGraph


@dataclass(slots=True)
class OrchestraState:
    objective: str
    graph: TaskGraph | None = None
    artifacts: ArtifactStore = field(default_factory=ArtifactStore)
    phase: str = "CREATED"
    verification: str | None = None
    repair_rounds: int = 0
    trace: list[str] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)

    def record(self, message: str) -> None:
        self.trace.append(message)


__all__ = ["OrchestraState"]
