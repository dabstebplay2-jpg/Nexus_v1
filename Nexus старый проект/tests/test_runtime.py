import asyncio
from pathlib import Path

import pytest

from nexus.core.change_engine import ChangeEngine
from nexus.core.event_types import EventType
from nexus.core.runtime import NexusRuntime
from nexus.models.manager import ModelManager
from nexus.version import CODENAME, VERSION


@pytest.fixture(autouse=True)
def isolated_runtime_config(tmp_path: Path, monkeypatch):
    (tmp_path / "models.yaml").write_text(
        "current: qwen\nmodels:\n  - id: qwen\n    name: Qwen\n    provider: ollama\n    model: qwen\n    type: local\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    async def mocked_generate(self, prompt, model_id=None, context=None):
        return "Task completed"

    monkeypatch.setattr(ModelManager, "generate", mocked_generate)


def test_runtime_boot():
    runtime = NexusRuntime()
    assert not runtime._booted
    asyncio.run(runtime.boot())
    assert runtime._booted
    assert runtime.kernel.state.value == "ONLINE"


def test_runtime_status():
    runtime = NexusRuntime()
    asyncio.run(runtime.boot())
    status = runtime.status()
    assert status["version"] == VERSION
    assert status["codename"] == CODENAME
    assert status["kernel"] == "ONLINE"
    assert status["agents"] >= 1
    assert status["tools"] >= 2


def test_runtime_registers_default_tools():
    runtime = NexusRuntime()
    asyncio.run(runtime.boot())
    tools = runtime.tools.list()
    assert "shell" in tools
    assert "filesystem" in tools


def test_runtime_run_task():
    runtime = NexusRuntime()
    result = asyncio.run(runtime.run_task("test prompt"))
    assert result["status"] == "COMPLETED"
    assert result["prompt"] == "test prompt"
    assert runtime.events.count(EventType.TASK_CREATED) == 1


def test_runtime_emits_events_on_task():
    runtime = NexusRuntime()
    asyncio.run(runtime.run_task("hello"))
    assert runtime.events.count(EventType.AGENT_STARTED) == 1
    assert runtime.events.count(EventType.TASK_COMPLETED) == 1
    assert runtime.events.count(EventType.MEMORY_UPDATED) == 1


def test_change_engine_record():
    engine = ChangeEngine()
    engine.snapshot("runtime.py", "old controller\n")
    change = engine.record("runtime.py", "added NexusRuntime\n")
    assert change.path == "runtime.py"
    assert "added NexusRuntime" in change.added
    assert "old controller" in change.removed


def test_change_engine_format():
    engine = ChangeEngine()
    change = engine.record("runtime.py", "added NexusRuntime\nremoved old controller\n")
    formatted = engine.format_change(change)
    assert "FILE:" in formatted
    assert "runtime.py" in formatted


def test_change_engine_summary():
    engine = ChangeEngine()
    engine.record("a.py", "line1\nline2\n")
    engine.record("b.py", "line3\n")
    summary = engine.summary()
    assert summary["files_changed"] == 2
