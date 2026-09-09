from io import StringIO

from rich.console import Console
from typer.testing import CliRunner

from nexus.cli import shell
from nexus.cli import display
from nexus.cli.main import app
from nexus.core.runtime import NexusRuntime
from nexus.models.manager import ModelManager


runner = CliRunner()


def _runtime(tmp_path, monkeypatch):
    (tmp_path / "models.yaml").write_text(
        """
current: ollama:qwen2.5
models:
  - id: ollama:qwen2.5
    name: Qwen 2.5
    provider: ollama
    provider_account: ollama
    model: qwen2.5
    type: local
    status: connected
    capabilities: [coding, reasoning]
    context_length: 32768
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    runtime = NexusRuntime()
    runtime.models = ModelManager(config_path=tmp_path / "models.yaml")
    monkeypatch.setattr(shell, "get_runtime", lambda: runtime)
    output = StringIO()
    test_console = Console(file=output, width=140, force_terminal=False)
    monkeypatch.setattr(shell, "console", test_console)
    monkeypatch.setattr(display, "console", test_console)
    return runtime, output


def test_model_namespace_and_deprecated_alias(tmp_path, monkeypatch):
    runtime, output = _runtime(tmp_path, monkeypatch)

    assert shell._handle_command("/model list") is True
    assert shell._handle_command("/model info ollama:qwen2.5") is True
    assert shell._handle_command("/model use ollama:qwen2.5") is True
    assert shell._handle_command("/models") is True

    text = output.getvalue()
    assert "ollama:qwen2.5" in text
    assert "Capabilities: coding, reasoning" in text
    assert "Active AI model" in text
    assert "Deprecated: use /model" in text
    assert runtime.models.current_id() == "ollama:qwen2.5"


def test_provider_secret_task_system_and_doctor_namespaces(tmp_path, monkeypatch):
    runtime, output = _runtime(tmp_path, monkeypatch)
    task = runtime.tasks.create({"prompt": "Create store"})
    task.status = "COMPLETED"

    for command in (
        "/provider list",
        "/provider info ollama",
        "/secret list",
        "/task history",
        "/task status",
        "/task cancel",
        "/system status",
        "/system agents",
        "/system tools",
        "/system memory",
        "/doctor",
    ):
        assert shell._handle_command(command) is True

    text = output.getvalue()
    assert "Connected AI Services" in text
    assert "Create store" in text
    assert "Nexus Tool Registry" in text
    assert "Nexus Memory System" in text
    assert "Runtime" in text and "Orchestra" in text


def test_help_uses_nexus_os_v2_language(monkeypatch):
    output = StringIO()
    monkeypatch.setattr(shell, "console", Console(file=output, width=120, force_terminal=False))

    shell._print_help_v2()

    text = output.getvalue()
    assert "Nexus OS V2 Commands" in text
    assert "/model" in text and "/provider" in text and "/secret" in text
    assert "current model" not in text.lower()
    assert "provider accounts" not in text.lower()


def test_terminal_cli_exposes_unified_namespaces(tmp_path, monkeypatch):
    runtime, output = _runtime(tmp_path, monkeypatch)
    monkeypatch.setattr("nexus.cli.main.get_runtime", lambda: runtime)
    monkeypatch.setattr("nexus.cli.models_cmd.get_runtime", lambda: runtime)
    monkeypatch.setattr("nexus.cli.providers_cmd.get_runtime", lambda: runtime)
    monkeypatch.setattr("nexus.cli.secrets_cmd.get_runtime", lambda: runtime)

    model = runner.invoke(app, ["model", "info", "ollama:qwen2.5"])
    provider = runner.invoke(app, ["provider", "list"])
    secret = runner.invoke(app, ["secret", "list"])

    assert model.exit_code == 0 and "coding, reasoning" in model.stdout
    assert provider.exit_code == 0
    assert secret.exit_code == 0
    assert "ollama" in output.getvalue() and "NOT SET" in output.getvalue()
