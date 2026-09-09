"""Autonomous team orchestration runtime."""

from __future__ import annotations

import inspect
from typing import Any, Callable

from nexus.agents.director import DirectorAgent
from nexus.agents.executor import AgentExecutor
from nexus.models.model_router import ModelRouter
from nexus.orchestra.graph import TaskGraph, WorkStatus, WorkUnit
from nexus.orchestra.state import OrchestraState
from nexus.orchestra.verifier import PASS, VerificationResult, VerifierAgent
from nexus.orchestra.worker import WorkerAgent


ProgressCallback = Callable[[str, dict[str, Any]], Any]


class OrchestraRuntime:
    """Plan, execute, exchange artifacts, verify, and optionally repair."""

    def __init__(
        self,
        director: DirectorAgent,
        executor: AgentExecutor,
        verifier: VerifierAgent | None = None,
        router: ModelRouter | None = None,
        max_repair_rounds: int = 1,
    ):
        self.director = director
        self.executor = executor
        self.verifier = verifier or VerifierAgent()
        self.router = router or executor.router
        self.max_repair_rounds = max(0, int(max_repair_rounds))
        self.state: OrchestraState | None = None

    async def _notify(
        self,
        callback: ProgressCallback | None,
        event: str,
        **payload: Any,
    ) -> None:
        if callback is None:
            return
        response = callback(event, payload)
        if inspect.isawaitable(response):
            await response

    def _worker(self, unit: WorkUnit) -> WorkerAgent:
        definition = self.director.planner.roles.get(unit.role)
        return WorkerAgent(
            role=unit.role,
            objective=unit.objective,
            executor=self.executor,
            tools=definition.tools if definition else (),
            router=self.router,
            role_definition=definition,
        )

    @staticmethod
    def _dependency_context(
        graph: TaskGraph,
        unit: WorkUnit,
        runtime_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        context = {
            "dependencies": [
                {
                    "task_id": dependency,
                    "role": graph.get(dependency).role,
                    "result": graph.get(dependency).result,
                }
                for dependency in unit.dependencies
                if graph.get(dependency) is not None
            ]
        }
        if runtime_context:
            context.update(runtime_context)
        if unit.role == "designer":
            from nexus.design.system import DesignSystem

            context["design_system"] = DesignSystem().to_dict()
        return context

    @staticmethod
    def _unsuccessful_ids(graph: TaskGraph) -> list[str]:
        failed: list[str] = []
        for unit in graph.tasks:
            result = unit.result
            if unit.status != WorkStatus.COMPLETED:
                failed.append(unit.id)
                continue
            if isinstance(result, dict):
                status = str(result.get("status", "completed")).lower()
                tool_failed = any(
                    isinstance(call.get("result"), dict)
                    and call["result"].get("ok") is False
                    for call in result.get("tools", [])
                )
                if status not in {"completed", "complete", "success", "passed", "pass"} or tool_failed:
                    failed.append(unit.id)
        return failed

    async def _execute_pending(
        self,
        state: OrchestraState,
        progress: ProgressCallback | None,
    ) -> None:
        graph = state.graph
        if graph is None:
            raise RuntimeError("Orchestra has no task graph")
        while True:
            ready = graph.get_ready_tasks()
            if not ready:
                pending = [unit for unit in graph.tasks if unit.status == WorkStatus.PENDING]
                if pending:
                    raise RuntimeError("TaskGraph is blocked by incomplete dependencies")
                return
            for unit in ready:
                graph.mark_running(unit)
                worker = self._worker(unit)
                selected = worker.select_model()
                unit.assigned_model = selected.id if selected else None
                position = sum(
                    item.status in {WorkStatus.RUNNING, WorkStatus.COMPLETED}
                    for item in graph.tasks
                )
                state.record(f"[{position}/{len(graph)}] {unit.role.title()}")
                await self._notify(
                    progress,
                    "worker_started",
                    unit=unit,
                    position=position,
                    total=len(graph),
                )
                try:
                    result = await worker.execute(
                        context=self._dependency_context(graph, unit, state.context),
                        artifacts=state.artifacts.list(),
                    )
                except Exception as exc:
                    result = {
                        "agent": unit.role.title(),
                        "role": unit.role,
                        "status": "failed",
                        "error": str(exc),
                        "tools": [],
                        "trace": ["Agent started", f"Failed: {exc}"],
                    }
                artifacts = state.artifacts.from_execution(unit.role, result)
                graph.complete_task(unit, result=result, artifacts=artifacts)
                await self._notify(progress, "worker_finished", unit=unit, result=result)

    async def execute(
        self,
        task: str,
        progress: ProgressCallback | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        state = OrchestraState(objective=str(task))
        state.context = dict(context or {})
        self.state = state
        state.phase = "PLANNING"
        state.record("[NEXUS ORCHESTRA]")
        state.record("Director planning...")
        await self._notify(progress, "planning_started", task=task)
        state.graph = await self.director.plan(
            str(task),
            context=state.context or None,
        )
        graph = state.graph
        team = [unit.role for unit in graph.get_execution_order()]
        state.record("Created team:")
        for role in team:
            state.record(f"✓ {role.title()}")
        state.record("Executing:")
        await self._notify(progress, "team_created", graph=graph, roles=team)

        state.phase = "EXECUTING"
        await self._execute_pending(state, progress)

        state.phase = "VERIFYING"
        state.record("Verification:")
        verification = self.verifier.assess(state.objective, graph)
        await self._notify(progress, "verification", result=verification)

        while verification.status != PASS and state.repair_rounds < self.max_repair_rounds:
            failed_ids = self._unsuccessful_ids(graph)
            state.repair_rounds += 1
            repair = await self.director.create_repair_task(
                state.objective,
                graph,
                verification,
            )
            state.record(f"Repair round {state.repair_rounds}: {repair.role.title()}")
            await self._notify(progress, "repair_created", unit=repair)
            await self._execute_pending(state, progress)
            if isinstance(repair.result, dict):
                repair.result["repairs"] = failed_ids
            verification = self.verifier.assess(state.objective, graph)
            await self._notify(progress, "verification", result=verification)

        state.verification = verification.status
        state.phase = "COMPLETED" if verification.status == PASS else "REPAIR_REQUIRED"
        state.record(verification.status)
        await self._notify(progress, "completed", status=verification.status)

        results = [unit.result for unit in graph.tasks if isinstance(unit.result, dict)]
        final = results[-1] if results else {}
        worker_trace = [
            entry
            for result in results
            for entry in result.get("trace", [])
        ]
        tool_calls = [
            call
            for result in results
            for call in result.get("tools", [])
        ]
        return {
            **final,
            "status": verification.status,
            "answer": final.get("answer") or final.get("error"),
            "tools": tool_calls,
            "trace": [*state.trace, *worker_trace],
            "orchestra_trace": list(state.trace),
            "verification": verification.status,
            "verification_errors": list(verification.errors),
            "team": team,
            "tasks": [
                {
                    "id": unit.id,
                    "role": unit.role,
                    "objective": unit.objective,
                    "status": unit.status,
                    "dependencies": list(unit.dependencies),
                    "assigned_model": unit.assigned_model,
                    "artifacts": [item.to_dict() for item in unit.artifacts],
                }
                for unit in graph.tasks
            ],
            "artifacts": [item.to_dict() for item in state.artifacts.list()],
            "worker_results": results,
            "repair_rounds": state.repair_rounds,
        }


__all__ = ["OrchestraRuntime"]
