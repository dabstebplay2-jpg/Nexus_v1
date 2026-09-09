import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

from typer.testing import CliRunner

import nexus.core.runtime as runtime_module
from nexus.agents.executor import AgentExecutor
from nexus.cli.main import app
from nexus.core.runtime import NexusRuntime
from nexus.memory.manager import MemoryManager
from nexus.models.manager import ModelManager
from nexus.tools.filesystem import ReadFileTool, WriteFileTool
from nexus.tools.registry import ToolRegistry


runner = CliRunner()


def _manager(tmp_path: Path) -> ModelManager:
    config = tmp_path / "models.yaml"
    config.write_text(
        """
current: qwen
models:
  - id: qwen
    name: Qwen
    provider: ollama
    model: qwen
    type: local
    capabilities: [coding]
""",
        encoding="utf-8",
    )
    return ModelManager(config_path=config)


def _tools(tmp_path: Path) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register("read_file", ReadFileTool(tmp_path))
    registry.register("write_file", WriteFileTool(tmp_path))
    return registry


def test_agent_calls_model_manager_and_provider(tmp_path: Path):
    manager = _manager(tmp_path)
    memory = MemoryManager()
    memory.remember("long", {"note": "hello task should use UTF-8"})
    provider = manager.get_provider("qwen")
    provider.generate = AsyncMock(
        side_effect=[
            '{"tool":"write_file","arguments":{"path":"hello.py",'
            '"content":"print(\\"Hello Nexus\\")\\n"}}',
            "Created hello.py successfully.",
        ]
    )
    original_generate = manager.generate
    manager.generate = AsyncMock(wraps=original_generate)
    executor = AgentExecutor(manager, memory, _tools(tmp_path))

    result = asyncio.run(executor.execute("Create hello Python file"))

    assert result["status"] == "completed"
    assert result["model_id"] == "qwen"
    assert result["tools"][0]["name"] == "write_file"
    assert (tmp_path / "hello.py").read_text(encoding="utf-8") == 'print("Hello Nexus")\n'
    assert manager.generate.await_count == 2
    assert provider.generate.await_count == 2
    assert "hello task should use UTF-8" in provider.generate.await_args_list[0].args[0]
    assert "Tool result (write_file)" in provider.generate.await_args_list[1].args[0]


def test_runtime_task_invokes_agent_executor(tmp_path: Path, monkeypatch):
    _manager(tmp_path)
    monkeypatch.chdir(tmp_path)
    runtime = NexusRuntime()
    runtime.agent_executor.execute = AsyncMock(
        return_value={
            "agent": "Director",
            "status": "completed",
            "answer": "done",
            "model": "Qwen",
            "model_id": "qwen",
            "memory_items": 0,
            "tools": [],
            "trace": ["Agent started", "Model: qwen", "Generating", "Completed"],
        }
    )

    result = asyncio.run(runtime.run_task("test task"))

    runtime.agent_executor.execute.assert_awaited_once()
    assert result["result"]["answer"] == "done"
    assert result["status"] == "COMPLETED"


def test_agent_read_file_tool(tmp_path: Path):
    manager = _manager(tmp_path)
    (tmp_path / "input.txt").write_text("Nexus context", encoding="utf-8")
    provider = manager.get_provider("qwen")
    provider.generate = AsyncMock(
        side_effect=[
            '{"tool":"read_file","arguments":{"path":"input.txt"}}',
            "The file contains Nexus context.",
        ]
    )
    executor = AgentExecutor(manager, MemoryManager(), _tools(tmp_path))

    result = asyncio.run(executor.execute("Read input.txt"))

    assert result["tools"][0]["name"] == "read_file"
    assert result["tools"][0]["result"]["content"] == "Nexus context"


def test_agent_retries_when_model_skips_required_tool(tmp_path: Path):
    manager = _manager(tmp_path)
    provider = manager.get_provider("qwen")
    provider.generate = AsyncMock(
        side_effect=[
            "I can create that file for you.",
            '{"tool":"write_file","arguments":{"path":"hello.py",'
            '"content":"print(\\"Hello Nexus\\")\\n"}}',
            "Created hello.py.",
        ]
    )
    executor = AgentExecutor(manager, MemoryManager(), _tools(tmp_path))

    result = asyncio.run(executor.execute("Create file hello.py"))

    assert provider.generate.await_count == 3
    assert result["tools"][0]["name"] == "write_file"
    assert (tmp_path / "hello.py").exists()


def test_agent_normalizes_code_block_to_write_tool(tmp_path: Path):
    manager = _manager(tmp_path)
    provider = manager.get_provider("qwen")
    provider.generate = AsyncMock(
        side_effect=[
            '```python\nprint("Hello Nexus")\n```',
            "Created hello.py.",
        ]
    )
    executor = AgentExecutor(manager, MemoryManager(), _tools(tmp_path))

    result = asyncio.run(executor.execute("Create file hello.py"))

    assert result["tools"][0]["name"] == "write_file"
    assert (tmp_path / "hello.py").read_text(encoding="utf-8") == 'print("Hello Nexus")\n'


def test_cli_task_runs_agent_and_renders_trace(tmp_path: Path, monkeypatch):
    _manager(tmp_path)
    monkeypatch.chdir(tmp_path)
    runtime_module._runtime = None
    responses = iter(
        [
            '{"tool":"write_file","arguments":{"path":"hello.py",'
            '"content":"print(\\"Hello Nexus\\")\\n"}}',
            "hello.py is ready",
        ]
    )

    async def mocked_generate(self, prompt, model_id=None, context=None):
        return next(responses)

    monkeypatch.setattr(ModelManager, "generate", mocked_generate)
    result = runner.invoke(
        app,
        ["task", "Создай Python файл hello.py который выводит Hello Nexus"],
    )
    runtime_module._runtime = None

    assert result.exit_code == 0
    assert "Agent started" in result.stdout
    assert "Model: qwen" in result.stdout
    assert "Generating" in result.stdout
    assert "Tool: write_file" in result.stdout
    assert "Completed" in result.stdout
    assert (tmp_path / "hello.py").exists()
