from __future__ import annotations

from dataclasses import dataclass, field
import uuid

@dataclass
class Task:
    id:str=field(default_factory=lambda:str(uuid.uuid4()))
    status:str="CREATED"
    context:dict=field(default_factory=dict)
    steps:list=field(default_factory=list)


class TaskManager:
    def __init__(self):
        self.tasks=[]

    def create(self,context):
        task=Task(context=context)
        self.tasks.append(task)
        return task

    def list(self):
        return self.tasks

    def get(self, task_id: str):
        return next((task for task in self.tasks if task.id == task_id), None)

    def current(self):
        active = [
            task
            for task in self.tasks
            if task.status in {"CREATED", "EXECUTING", "CANCEL_REQUESTED"}
        ]
        return active[-1] if active else None

    def history(self) -> list[dict]:
        return [
            {
                "id": task.id,
                "status": task.status,
                "prompt": task.context.get("prompt") or task.context.get("input"),
                "steps": list(task.steps),
            }
            for task in self.tasks
        ]

    def cancel(self, task_id: str | None = None) -> bool:
        task = self.get(task_id) if task_id else self.current()
        if task is None or task.status in {"COMPLETED", "FAILED", "CANCELLED"}:
            return False
        task.status = "CANCEL_REQUESTED"
        task.context["cancel_requested"] = True
        return True
