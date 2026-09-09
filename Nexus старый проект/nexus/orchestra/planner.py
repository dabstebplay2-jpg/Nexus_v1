"""Role-driven team planner."""

from __future__ import annotations

from nexus.orchestra.graph import TaskGraph, WorkUnit
from nexus.orchestra.roles import RoleRegistry, default_role_registry


class OrchestraPlanner:
    def __init__(self, roles: RoleRegistry | None = None):
        self.roles = roles or default_role_registry()

    def plan(self, task: str, context: dict | None = None) -> TaskGraph:
        graph = TaskGraph()
        previous_id: str | None = None
        project_note = ""
        if context:
            project = context.get("project", context)
            if hasattr(project, "to_dict"):
                project = project.to_dict()
            if isinstance(project, dict):
                project_note = (
                    "\nProject context: "
                    f"language={project.get('language', 'Unknown')}, "
                    f"framework={project.get('framework', 'Unknown')}, "
                    f"build={project.get('build', 'Unknown')}, "
                    f"files={project.get('files', 0)}"
                )
        for role in self.roles.select(str(task)):
            unit = WorkUnit(
                role=role.name,
                objective=role.objective_for(str(task)) + project_note,
                dependencies=[previous_id] if previous_id else [],
            )
            graph.add_task(unit)
            previous_id = unit.id
        if not len(graph):
            raise RuntimeError("Planner could not assign a role to the task")
        return graph


__all__ = ["OrchestraPlanner"]
