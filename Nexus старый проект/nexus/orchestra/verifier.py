"""Goal and execution verification for Orchestra."""

from __future__ import annotations

from dataclasses import dataclass, field

from nexus.orchestra.graph import TaskGraph, WorkStatus


PASS = "PASS"
REPAIR_REQUIRED = "REPAIR_REQUIRED"


@dataclass(slots=True)
class VerificationResult:
    status: str
    errors: list[str] = field(default_factory=list)
    repair_task_ids: list[str] = field(default_factory=list)


class VerifierAgent:
    PASS = PASS
    REPAIR_REQUIRED = REPAIR_REQUIRED

    def __init__(self):
        self.last_result: VerificationResult | None = None

    def assess(self, objective: str, graph: TaskGraph) -> VerificationResult:
        errors: list[str] = []
        covered = {
            repaired_id
            for task in graph.tasks
            if isinstance(task.result, dict)
            for repaired_id in task.result.get("repairs", [])
        }
        for task in graph.tasks:
            if task.id in covered:
                continue
            if task.status != WorkStatus.COMPLETED:
                errors.append(f"{task.role}: task did not complete")
                continue
            if not isinstance(task.result, dict):
                if task.result is None:
                    errors.append(f"{task.role}: no result")
                continue
            status = str(task.result.get("status", "completed")).lower()
            if status not in {"completed", "complete", "success", "passed", "pass"}:
                errors.append(f"{task.role}: {task.result.get('error') or status}")
            for call in task.result.get("tools", []):
                tool_result = call.get("result")
                if isinstance(tool_result, dict) and tool_result.get("ok") is False:
                    errors.append(
                        f"{task.role}/{call.get('name')}: {tool_result.get('error', 'tool failed')}"
                    )

        if not objective.strip():
            errors.append("Original objective is empty")
        result = VerificationResult(REPAIR_REQUIRED if errors else PASS, errors)
        self.last_result = result
        return result

    def verify(self, objective: str, graph: TaskGraph) -> str:
        return self.assess(objective, graph).status


Verifier = VerifierAgent

__all__ = [
    "PASS",
    "REPAIR_REQUIRED",
    "VerificationResult",
    "Verifier",
    "VerifierAgent",
]
