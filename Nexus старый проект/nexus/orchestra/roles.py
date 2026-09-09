"""Extensible role definitions used by planning and worker configuration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True, slots=True)
class RoleDefinition:
    name: str
    objective_template: str
    capabilities: tuple[str, ...] = ()
    tools: tuple[str, ...] = ()
    triggers: tuple[str, ...] = ()
    phase: int = 100
    default: bool = False
    quality_gate: bool = False
    repair: bool = False

    def matches(self, task: str) -> bool:
        text = str(task).lower()
        return any(trigger in text for trigger in self.triggers)

    def objective_for(self, task: str) -> str:
        return self.objective_template.format(task=task)


class RoleRegistry:
    """Mutable registry; applications and plugins may add roles at runtime."""

    def __init__(self, roles: Iterable[RoleDefinition] | None = None):
        self._roles: dict[str, RoleDefinition] = {}
        for role in roles or []:
            self.register(role)

    def register(self, role: RoleDefinition) -> RoleDefinition:
        if not isinstance(role, RoleDefinition):
            raise TypeError("RoleRegistry accepts only RoleDefinition values")
        self._roles[role.name] = role
        return role

    def get(self, name: str) -> RoleDefinition | None:
        return self._roles.get(name)

    def list(self) -> list[RoleDefinition]:
        return sorted(self._roles.values(), key=lambda item: item.phase)

    def select(self, task: str) -> list[RoleDefinition]:
        selected = [role for role in self.list() if role.matches(task)]
        primary = [role for role in selected if not role.quality_gate]
        explicit_gates = [role for role in selected if role.quality_gate]
        if not primary and explicit_gates:
            return explicit_gates
        if not primary:
            default = next((role for role in self.list() if role.default), None)
            primary = [default] if default else []
        automatic_gates = (
            [role for role in self.list() if role.quality_gate]
            if len(primary) > 1
            else []
        )
        unique = {role.name: role for role in [*primary, *explicit_gates, *automatic_gates] if role}
        return sorted(unique.values(), key=lambda item: item.phase)

    def repair_role(self) -> RoleDefinition:
        role = next((item for item in self.list() if item.repair), None)
        if role is None:
            role = next((item for item in self.list() if item.default), None)
        if role is None:
            raise RuntimeError("No repair or default role is registered")
        return role


def default_role_registry() -> RoleRegistry:
    """Build defaults as data; callers can replace or extend this registry."""
    registry = RoleRegistry()
    registry.register(
        RoleDefinition(
            name="architect",
            objective_template="Design the architecture and constraints for: {task}",
            capabilities=("reasoning", "long_context"),
            tools=("list_files", "read_file", "search_code", "git_history"),
            triggers=("architecture", "system", "website", "site", "store", "api", "архитект", "сайт", "магазин"),
            phase=10,
        )
    )
    registry.register(
        RoleDefinition(
            name="researcher",
            objective_template="Research the requirements and relevant evidence for: {task}",
            capabilities=("reasoning",),
            tools=("list_files", "read_file", "search_code"),
            triggers=("research", "investigate", "compare", "analyze", "исслед", "сравн", "анализ"),
            phase=20,
        )
    )
    registry.register(
        RoleDefinition(
            name="designer",
            objective_template="Create the user experience and visual design for: {task}",
            capabilities=("vision", "image"),
            tools=("list_files", "read_file", "write_file", "edit_file", "search_code"),
            triggers=("design", "ui", "ux", "website", "site", "store", "дизайн", "интерфейс", "сайт", "магазин"),
            phase=30,
        )
    )
    registry.register(
        RoleDefinition(
            name="developer",
            objective_template="Implement the requested deliverable: {task}",
            capabilities=("coding", "long_context", "tools"),
            tools=(
                "list_files", "read_file", "write_file", "edit_file", "search_code",
                "run_command", "run_tests", "run_build", "install_dependencies",
                "git_status", "git_diff",
            ),
            triggers=("code", "file", "python", "implement", "build", "create", "api", "website", "site", "store", "код", "файл", "создай", "реализ", "сайт", "магазин"),
            phase=50,
            default=True,
            repair=True,
        )
    )
    registry.register(
        RoleDefinition(
            name="tester",
            objective_template="Test the produced result against the original goal: {task}",
            capabilities=("reasoning", "tools"),
            tools=("list_files", "read_file", "search_code", "run_tests", "run_build", "git_diff"),
            triggers=("test", "verify", "check", "тест", "проверь"),
            phase=90,
            quality_gate=True,
        )
    )
    return registry


__all__ = ["RoleDefinition", "RoleRegistry", "default_role_registry"]
