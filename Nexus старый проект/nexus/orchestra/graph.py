"""Dependency-aware task graph for Nexus Orchestra."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable
import uuid

from nexus.orchestra.artifacts import Artifact


class WorkStatus:
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(slots=True)
class WorkUnit:
    role: str
    objective: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: str = WorkStatus.PENDING
    dependencies: list[str] = field(default_factory=list)
    assigned_model: str | None = None
    result: Any = None
    artifacts: list[Artifact] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.role = str(self.role).strip()
        self.objective = str(self.objective).strip()
        if not self.role or not self.objective:
            raise ValueError("WorkUnit role and objective cannot be empty")
        self.dependencies = list(
            dict.fromkeys(
                item.id if isinstance(item, WorkUnit) else str(item)
                for item in self.dependencies
            )
        )


class TaskGraph:
    def __init__(self, tasks: Iterable[WorkUnit] | None = None):
        self._tasks: dict[str, WorkUnit] = {}
        for task in tasks or []:
            self.add_task(task)

    @property
    def tasks(self) -> list[WorkUnit]:
        return list(self._tasks.values())

    def __len__(self) -> int:
        return len(self._tasks)

    def get(self, task_id: str) -> WorkUnit | None:
        return self._tasks.get(str(task_id))

    def add_task(
        self,
        task: WorkUnit | None = None,
        *,
        role: str | None = None,
        objective: str | None = None,
        dependencies: Iterable[str] | None = None,
    ) -> WorkUnit:
        unit = task or WorkUnit(
            role=str(role or ""),
            objective=str(objective or ""),
            dependencies=list(dependencies or []),
        )
        if not isinstance(unit, WorkUnit):
            raise TypeError("TaskGraph accepts only WorkUnit values")
        if unit.id in self._tasks:
            raise ValueError(f"Task already exists: {unit.id}")
        missing = [item for item in unit.dependencies if item not in self._tasks]
        if missing:
            raise ValueError(f"Unknown task dependencies: {missing}")
        self._tasks[unit.id] = unit
        try:
            self.get_execution_order()
        except Exception:
            self._tasks.pop(unit.id, None)
            raise
        return unit

    def get_ready_tasks(self) -> list[WorkUnit]:
        return [
            task
            for task in self._tasks.values()
            if task.status == WorkStatus.PENDING
            and all(self._tasks[item].status == WorkStatus.COMPLETED for item in task.dependencies)
        ]

    def mark_running(self, task: str | WorkUnit) -> WorkUnit:
        unit = self._resolve(task)
        if unit.status != WorkStatus.PENDING:
            raise ValueError(f"Task is not pending: {unit.id}")
        unit.status = WorkStatus.RUNNING
        return unit

    def complete_task(
        self,
        task: str | WorkUnit,
        result: Any = None,
        artifacts: Iterable[Artifact] | None = None,
    ) -> WorkUnit:
        unit = self._resolve(task)
        unit.status = WorkStatus.COMPLETED
        unit.result = result
        unit.artifacts = list(artifacts or [])
        return unit

    def fail_task(self, task: str | WorkUnit, error: Any) -> WorkUnit:
        unit = self._resolve(task)
        unit.status = WorkStatus.FAILED
        unit.result = error
        return unit

    def get_execution_order(self) -> list[WorkUnit]:
        indegree = {task_id: 0 for task_id in self._tasks}
        children = {task_id: [] for task_id in self._tasks}
        for task in self._tasks.values():
            for dependency in task.dependencies:
                if dependency not in self._tasks:
                    raise ValueError(f"Unknown task dependency: {dependency}")
                indegree[task.id] += 1
                children[dependency].append(task.id)

        queue = [task_id for task_id in self._tasks if indegree[task_id] == 0]
        order: list[WorkUnit] = []
        while queue:
            task_id = queue.pop(0)
            order.append(self._tasks[task_id])
            for child in children[task_id]:
                indegree[child] -= 1
                if indegree[child] == 0:
                    queue.append(child)
        if len(order) != len(self._tasks):
            raise ValueError("TaskGraph contains a dependency cycle")
        return order

    def is_complete(self) -> bool:
        return bool(self._tasks) and all(
            task.status in {WorkStatus.COMPLETED, WorkStatus.FAILED}
            for task in self._tasks.values()
        )

    def _resolve(self, task: str | WorkUnit) -> WorkUnit:
        task_id = task.id if isinstance(task, WorkUnit) else str(task)
        unit = self.get(task_id)
        if unit is None:
            raise KeyError(f"Task not found: {task_id}")
        return unit


__all__ = ["TaskGraph", "WorkStatus", "WorkUnit"]
