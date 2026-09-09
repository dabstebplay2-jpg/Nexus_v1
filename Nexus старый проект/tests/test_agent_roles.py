from types import SimpleNamespace

from nexus.agents.roles import (
    ArchitectAgent,
    DesignerAgent,
    DeveloperAgent,
    QAAgent,
    ReviewerAgent,
)
from nexus.orchestra.worker import WorkerAgent


def test_role_facades_define_permissions_without_new_execution_engines():
    architect = ArchitectAgent()
    developer = DeveloperAgent()
    designer = DesignerAgent()
    qa = QAAgent()
    reviewer = ReviewerAgent()

    assert architect.writes_code is False
    assert reviewer.writes_code is False
    assert developer.writes_code is True and "write_file" in developer.tools
    assert designer.writes_code is True and "edit_file" in designer.tools
    assert "run_tests" in qa.tools and "run_build" in qa.tools


def test_role_creates_universal_worker():
    router = SimpleNamespace()
    executor = SimpleNamespace(router=router)

    worker = DeveloperAgent().create_worker("Implement header", executor)

    assert isinstance(worker, WorkerAgent)
    assert worker.role == "developer"
    assert "search_code" in worker.tools
