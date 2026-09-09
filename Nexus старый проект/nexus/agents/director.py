"""Team director for Nexus Orchestra."""

from __future__ import annotations

from nexus.orchestra.graph import TaskGraph, WorkUnit
from nexus.orchestra.planner import OrchestraPlanner
from nexus.orchestra.verifier import VerificationResult


class DirectorAgent:
    """Plan and repair team work; never execute a work unit itself."""

    def __init__(self, name="Director", executor=None, planner: OrchestraPlanner | None = None):
        self.name = name
        self.status = "READY"
        # Retained for construction compatibility. Workers own execution now.
        self.executor = executor
        self.planner = planner or OrchestraPlanner()

    async def run(self, task):
        return await self.plan(task)

    async def execute(self, task):
        raise RuntimeError("Director does not execute tasks; use Director.plan() and WorkerAgent")

    async def plan(self, task, context: dict | None = None):
        self.status = "PLANNING"
        try:
            graph = self.planner.plan(str(task), context=context)
        except Exception:
            self.status = "FAILED"
            raise
        self.status = "READY"
        return graph

    async def create_repair_task(
        self,
        task: str,
        graph: TaskGraph,
        verification: VerificationResult,
    ) -> WorkUnit:
        role = self.planner.roles.repair_role()
        dependencies = [unit.id for unit in graph.tasks if unit.status == "COMPLETED"]
        objective = (
            f"Repair the result for: {task}. "
            f"Verification errors: {'; '.join(verification.errors)}"
        )
        return graph.add_task(
            role=role.name,
            objective=objective,
            dependencies=dependencies,
        )


__all__ = ["DirectorAgent"]
