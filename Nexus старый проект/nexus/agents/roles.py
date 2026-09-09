"""Named Nexus OS V2 role facades backed by the universal WorkerAgent."""

from __future__ import annotations

from dataclasses import dataclass

from nexus.orchestra.worker import WorkerAgent


@dataclass(frozen=True, slots=True)
class AgentRole:
    name: str
    purpose: str
    tools: tuple[str, ...]
    writes_code: bool = False

    def create_worker(self, objective: str, executor, **kwargs) -> WorkerAgent:
        return WorkerAgent(
            role=self.name,
            objective=objective,
            executor=executor,
            tools=self.tools,
            **kwargs,
        )


class ArchitectAgent(AgentRole):
    def __init__(self):
        super().__init__(
            "architect",
            "Анализирует проект и проектирует решение, не изменяя код",
            ("list_files", "read_file", "search_code", "git_history"),
            False,
        )


class DeveloperAgent(AgentRole):
    def __init__(self):
        super().__init__(
            "developer",
            "Реализует решение, изменяет файлы и запускает команды",
            (
                "list_files", "read_file", "write_file", "edit_file", "search_code",
                "run_command", "run_tests", "run_build", "install_dependencies",
                "git_status", "git_diff",
            ),
            True,
        )


class DesignerAgent(AgentRole):
    def __init__(self):
        super().__init__(
            "designer",
            "Проектирует UI, UX, motion и дизайн-систему",
            ("list_files", "read_file", "write_file", "edit_file", "search_code"),
            True,
        )


class QAAgent(AgentRole):
    def __init__(self):
        super().__init__(
            "tester",
            "Запускает тесты и сборку, проверяет результат",
            ("list_files", "read_file", "search_code", "run_tests", "run_build", "git_diff"),
            False,
        )


class ReviewerAgent(AgentRole):
    def __init__(self):
        super().__init__(
            "reviewer",
            "Проверяет архитектуру, изменения и соответствие цели",
            ("read_file", "search_code", "git_status", "git_diff", "git_history"),
            False,
        )


__all__ = ["AgentRole", "ArchitectAgent", "DesignerAgent", "DeveloperAgent", "QAAgent", "ReviewerAgent"]
