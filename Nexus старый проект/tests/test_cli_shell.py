from pathlib import Path
from unittest.mock import AsyncMock

import nexus.cli.shell as shell
import nexus.core.runtime as runtime_module
from nexus.core.runtime import NexusRuntime
from nexus.models.types import DiscoveredModel


def _runtime(tmp_path: Path, monkeypatch) -> NexusRuntime:
    (tmp_path / "models.yaml").write_text(
        """
current: cloud
models:
  - id: cloud
    name: Cloud Model
    provider: openai_compatible
    model: initial-model
    type: cloud
    base_url: https://example.invalid/v1
""",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    runtime_module._runtime = None
    runtime = NexusRuntime()
    monkeypatch.setattr(shell, "get_runtime", lambda: runtime)
    return runtime


def test_shell_commands_require_slash():
    assert shell._handle_command("status") is False
    assert shell._is_bare_command("status") is True
    assert shell._is_bare_command("task hello") is True
    assert shell._is_bare_command("ordinary chat message") is False


def test_shell_saves_and_shows_api_key(tmp_path: Path, monkeypatch):
    runtime = _runtime(tmp_path, monkeypatch)
    monkeypatch.setattr(shell.Prompt, "ask", lambda *args, **kwargs: "secret-api-key")

    assert shell._handle_command("/key set cloud") is True

    info = runtime.models.api_key_info("cloud")
    assert info["configured"] is True
    assert info["value"] != "secret-api-key"
    assert (tmp_path / ".nexus" / "secrets.yaml").exists()


def test_shell_discovers_and_selects_api_model(tmp_path: Path, monkeypatch):
    runtime = _runtime(tmp_path, monkeypatch)
    runtime.models.get_provider("cloud").list_models = AsyncMock(
        return_value=[
            DiscoveredModel(id="model-a", name="Model A", provider_id="cloud"),
            DiscoveredModel(id="model-b", name="Model B", provider_id="cloud"),
        ]
    )
    monkeypatch.setattr(shell.Prompt, "ask", lambda *args, **kwargs: "2")

    assert shell._handle_command("/models discover cloud") is True
    assert runtime.models.get("cloud").model == "initial-model"
    assert runtime.models.get("cloud:model-a").model == "model-a"
    assert runtime.models.get("cloud:model-b").model == "model-b"
    assert runtime.models.current_id() == "cloud:model-b"


def test_shell_provider_commands_and_catalog_refresh(tmp_path: Path, monkeypatch):
    runtime = _runtime(tmp_path, monkeypatch)
    runtime.models.refresh_catalog = AsyncMock(return_value=[])

    assert shell._handle_command("/providers add local ollama") is True
    assert runtime.models.accounts.get("local").provider == "ollama"
    assert shell._handle_command("/providers") is True
    assert shell._handle_command("/models refresh local") is True
    runtime.models.refresh_catalog.assert_awaited_once_with("local")
