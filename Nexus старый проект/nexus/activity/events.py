"""Canonical events emitted by autonomous Nexus work."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
import uuid


class ActivityType(str, Enum):
    PROJECT_ANALYSIS_STARTED = "project.analysis.started"
    PROJECT_ANALYZED = "project.analyzed"
    DIRECTOR_STARTED = "director.started"
    DIRECTOR_PLANNING = "director.planning"
    TEAM_CREATED = "team.created"
    AGENT_STARTED = "agent.started"
    AGENT_THINKING = "agent.thinking"
    FILE_READ = "file.read"
    FILE_WRITE = "file.write"
    COMMAND_RUN = "command.run"
    TEST_RUN = "test.run"
    BUILD_RUN = "build.run"
    VERIFICATION_STARTED = "verification.started"
    REPAIR_STARTED = "repair.started"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(slots=True)
class AgentEvent:
    type: str
    agent: str = "Nexus"
    target: str | None = None
    status: str = "info"
    message: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def __post_init__(self) -> None:
        if isinstance(self.type, ActivityType):
            self.type = self.type.value

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


__all__ = ["ActivityType", "AgentEvent"]
