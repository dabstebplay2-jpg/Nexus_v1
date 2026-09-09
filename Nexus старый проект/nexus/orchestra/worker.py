"""Universal role-configured Orchestra worker."""

from __future__ import annotations

from typing import Any, Iterable

from nexus.agents.executor import AgentExecutor
from nexus.models.model_router import ModelRouter
from nexus.models.types import ModelEntry
from nexus.orchestra.artifacts import Artifact
from nexus.orchestra.roles import RoleDefinition


class WorkerAgent:
    """One universal worker whose behavior is supplied by its role."""

    def __init__(
        self,
        role: str,
        objective: str,
        executor: AgentExecutor,
        tools: Iterable[str] | None = None,
        model: str | ModelEntry | None = "auto",
        router: ModelRouter | None = None,
        role_definition: RoleDefinition | None = None,
    ):
        self.role = str(role)
        self.objective = str(objective)
        self.executor = executor
        self.tools = list(tools or [])
        self.model = model
        self.router = router or executor.router
        self.role_definition = role_definition

    def select_model(self) -> ModelEntry | None:
        if isinstance(self.model, ModelEntry):
            return self.model
        if isinstance(self.model, str) and self.model != "auto":
            return self.executor.models.get(self.model)
        requirements = self.role_definition.capabilities if self.role_definition else ()
        return self.router.choose_for_capabilities(
            requirements,
            self.objective,
            preferred=self.executor.models.current_id(),
        )

    async def execute(
        self,
        context: dict[str, Any] | None = None,
        artifacts: Iterable[Artifact] | None = None,
    ) -> dict[str, Any]:
        selected = self.select_model()
        result = await self.executor.execute(
            role=self.role,
            objective=self.objective,
            context=context or {},
            artifacts=list(artifacts or []),
            model_id=selected.id if selected else None,
            agent_name=self.role.title(),
            allowed_tools=self.tools,
        )
        if isinstance(result, dict):
            result.setdefault("role", self.role)
            result.setdefault("objective", self.objective)
        return result


__all__ = ["WorkerAgent"]
