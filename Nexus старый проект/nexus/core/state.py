from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SystemState(str, Enum):
    OFFLINE = "OFFLINE"
    BOOTING = "BOOTING"
    ONLINE = "ONLINE"
    SHUTTING_DOWN = "SHUTTING_DOWN"


class TaskStatus(str, Enum):
    CREATED = "CREATED"
    ANALYZING = "ANALYZING"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REPAIRING = "REPAIRING"


@dataclass
class ActionRecord:
    agent: str
    action: str
    result: Any = None
    error: str | None = None


@dataclass
class SystemStatus:
    state: SystemState = SystemState.OFFLINE
    version: str = ""
    codename: str = ""
    agents_loaded: int = 0
    tools_loaded: int = 0
    plugins_loaded: int = 0
    memory_online: bool = False
    kernel_online: bool = False
