"""Canonical event names for Nexus subsystems."""

from enum import Enum


class EventType(str, Enum):
    AGENT_STARTED = "agent.started"
    AGENT_FINISHED = "agent.finished"
    TASK_CREATED = "task.created"
    TASK_COMPLETED = "task.completed"
    TASK_FAILED = "task.failed"
    TOOL_EXECUTED = "tool.executed"
    MEMORY_UPDATED = "memory.updated"
    ERROR_OCCURRED = "error.occurred"
    RUNTIME_BOOT_START = "runtime.boot.start"
    RUNTIME_BOOT_COMPLETE = "runtime.boot.complete"
    RUNTIME_SHUTDOWN_START = "runtime.shutdown.start"
    RUNTIME_SHUTDOWN_COMPLETE = "runtime.shutdown.complete"
    CHANGE_RECORDED = "change.recorded"
