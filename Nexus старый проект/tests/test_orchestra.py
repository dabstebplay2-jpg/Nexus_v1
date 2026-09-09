import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

from nexus.agents.director import DirectorAgent
from nexus.agents.executor import AgentExecutor
from nexus.memory.manager import MemoryManager
from nexus.models.manager import ModelManager
from nexus.models.model_router import ModelRouter
from nexus.orchestra.artifacts import ArtifactStore
from nexus.orchestra.graph import TaskGraph, WorkUnit
from nexus.orchestra.runtime import OrchestraRuntime
from nexus.orchestra.verifier import PASS
from nexus.tools.registry import ToolRegistry


def _manager(tmp_path: Path) -> ModelManager:
    config = tmp_path / "models.yaml"
    config.write_text(
        """
current: current
models:
  - id: current
    name: Current
    provider: ollama
    model: current
    type: local
    capabilities: [chat]
  - id: coder
    name: Coder
    provider: openai
    model: coder
    type: cloud
    capabilities: [coding, tools, long_context]
    context_length: 100000
""",
        encoding="utf-8",
    )
    return ModelManager(config)


def test_task_graph_resolves_dependencies_in_order():
    graph = TaskGraph()
    design = graph.add_task(role="designer", objective="Design")
    develop = graph.add_task(
        role="developer", objective="Build", dependencies=[design]
    )
    test = graph.add_task(
        role="tester", objective="Test", dependencies=[develop.id]
    )

    assert graph.get_ready_tasks() == [design]
    graph.complete_task(design, {"status": "completed"})
    assert graph.get_ready_tasks() == [develop]
    assert graph.get_execution_order() == [design, develop, test]


def test_director_plans_a_team_without_executing_work():
    director = DirectorAgent()
    graph = asyncio.run(director.plan("Создай сайт магазина"))

    assert [unit.role for unit in graph.get_execution_order()] == [
        "architect",
        "designer",
        "developer",
        "tester",
    ]


def test_model_router_selects_role_capabilities_and_falls_back(tmp_path: Path):
    manager = _manager(tmp_path)
    router = ModelRouter(manager)

    assert router.choose_for_capabilities(
        ["coding", "tools", "long_context"], "implement"
    ).id == "coder"
    assert router.choose_for_capabilities(["vision", "image"], "design").id == "current"
    assert manager.current_id() == "current"


def test_orchestra_passes_context_and_collects_artifacts(tmp_path: Path):
    manager = _manager(tmp_path)
    executor = AgentExecutor(manager, MemoryManager(), ToolRegistry())
    executor.execute = AsyncMock(
        side_effect=[
            {
                "status": "completed",
                "answer": "architecture",
                "tools": [],
                "trace": [],
            },
            {
                "status": "completed",
                "answer": "design",
                "tools": [],
                "trace": [],
            },
            {
                "status": "completed",
                "answer": "built",
                "tools": [
                    {
                        "name": "write_file",
                        "result": {"path": "shop.py", "bytes": 10},
                    }
                ],
                "trace": [],
            },
            {"status": "completed", "answer": "tested", "tools": [], "trace": []},
        ]
    )
    runtime = OrchestraRuntime(DirectorAgent(), executor)

    result = asyncio.run(runtime.execute("Создай сайт магазина"))

    assert result["verification"] == PASS
    assert executor.execute.await_count == 4
    second_context = executor.execute.await_args_list[1].kwargs["context"]
    assert second_context["dependencies"][0]["result"]["answer"] == "architecture"
    assert any(item["path"] == "shop.py" for item in result["artifacts"])


def test_orchestra_creates_repair_task_after_failed_result(tmp_path: Path):
    manager = _manager(tmp_path)
    executor = AgentExecutor(manager, MemoryManager(), ToolRegistry())
    executor.execute = AsyncMock(
        side_effect=[
            {"status": "failed", "error": "broken", "tools": [], "trace": []},
            {"status": "completed", "answer": "repaired", "tools": [], "trace": []},
        ]
    )
    runtime = OrchestraRuntime(DirectorAgent(), executor, max_repair_rounds=1)

    result = asyncio.run(runtime.execute("Создай файл hello.py"))

    assert result["verification"] == PASS
    assert result["repair_rounds"] == 1
    assert len(result["tasks"]) == 2


def test_artifact_store_creates_result_artifact():
    store = ArtifactStore()
    artifacts = store.from_execution("researcher", {"answer": "evidence", "tools": []})

    assert artifacts[0].type == "result"
    assert artifacts[0].owner == "researcher"
