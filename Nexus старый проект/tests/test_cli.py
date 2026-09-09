from pathlib import Path

import pytest
from typer.testing import CliRunner

import nexus.core.runtime as runtime_module
from nexus.cli.main import app
from nexus.models.manager import ModelManager
from nexus.version import CODENAME, VERSION


runner = CliRunner()


@pytest.fixture(autouse=True)
def isolated_cli_runtime(tmp_path: Path, monkeypatch):
    (tmp_path / "models.yaml").write_text(
        """
current: gpt5
models:
  - id: gpt5
    name: GPT-5
    provider: openai
    model: gpt-5
    type: cloud
  - id: qwen
    name: Qwen Coder
    provider: ollama
    model: qwen2.5-coder
    type: local
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    runtime_module._runtime = None

    async def mocked_refresh(self):
        return self.list()

    monkeypatch.setattr(ModelManager, "refresh_status", mocked_refresh)
    yield
    runtime_module._runtime = None


def test_cli_version():
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert VERSION in result.stdout
    assert CODENAME in result.stdout


def test_cli_status():
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "5.0.0-beta" in result.stdout
    assert "Kernel" in result.stdout or "ONLINE" in result.stdout


def test_cli_agents():
    result = runner.invoke(app, ["agents"])
    assert result.exit_code == 0
    assert "Director" in result.stdout


def test_cli_tools():
    result = runner.invoke(app, ["tools"])
    assert result.exit_code == 0
    assert "shell" in result.stdout


def test_cli_memory():
    result = runner.invoke(app, ["memory"])
    assert result.exit_code == 0
    assert "Short Term" in result.stdout or "short" in result.stdout.lower()


def test_cli_models():
    result = runner.invoke(app, ["models", "list"])
    assert result.exit_code == 0
    assert "GPT-5" in result.stdout
    assert "Qwen" in result.stdout


def test_cli_models_default():
    result = runner.invoke(app, ["models"])
    assert result.exit_code == 0
    assert "Nexus Models" in result.stdout


def test_cli_models_use_and_current():
    use_result = runner.invoke(app, ["models", "use", "qwen"])
    current_result = runner.invoke(app, ["models", "current"])
    assert use_result.exit_code == 0
    assert current_result.exit_code == 0
    assert "Qwen" in current_result.stdout


def test_cli_models_add_and_remove():
    add_result = runner.invoke(
        app,
        [
            "models",
            "add",
            "--id",
            "custom",
            "--name",
            "Custom",
            "--provider",
            "openai_compatible",
            "--model",
            "custom-model",
            "--base-url",
            "http://localhost:9999/v1",
        ],
    )
    remove_result = runner.invoke(app, ["models", "remove", "custom"])
    assert add_result.exit_code == 0
    assert remove_result.exit_code == 0


def test_cli_models_test(monkeypatch):
    async def mocked_test(self, model_id=None, prompt="Hello"):
        return {"ok": True, "model_id": model_id or self.current_id(), "response": "pong"}

    monkeypatch.setattr(ModelManager, "test", mocked_test)
    result = runner.invoke(app, ["models", "test", "qwen"])
    assert result.exit_code == 0
    assert "connected" in result.stdout


def test_cli_models_doctor():
    result = runner.invoke(app, ["models", "doctor"])
    assert result.exit_code == 0
    assert "Config OK" in result.stdout
    assert "Registry OK" in result.stdout
    assert "Providers OK" in result.stdout
    assert "Current model OK" in result.stdout


def test_cli_doctor():
    result = runner.invoke(app, ["doctor"])
    assert result.exit_code == 0
    assert "Doctor" in result.stdout or "Health" in result.stdout
