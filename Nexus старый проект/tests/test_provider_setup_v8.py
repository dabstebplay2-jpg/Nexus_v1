import asyncio
from io import StringIO
from pathlib import Path
from unittest.mock import AsyncMock

from typer.testing import CliRunner

import nexus.core.runtime as runtime_module
from nexus.cli.main import app
from nexus.cli.provider_wizard import ProviderSetupWizard
from nexus.cli.secure_input import read_api_key
from nexus.models.manager import ModelManager
from nexus.models.secrets import SecretStore
from nexus.models.types import DiscoveredModel, ModelEntry


runner = CliRunner()


def _empty_manager(tmp_path: Path) -> ModelManager:
    model_config = tmp_path / "models.yaml"
    model_config.write_text("models: []\n", encoding="utf-8")
    return ModelManager(
        model_config,
        secret_store=SecretStore(tmp_path / ".nexus" / "secrets.yaml"),
    )


def test_api_key_reader_supports_ordinary_stdin():
    output = StringIO()
    value = read_api_key(
        "Key: ",
        input_stream=StringIO("pasted-secret\n"),
        output_stream=output,
    )

    assert value == "pasted-secret"
    assert output.getvalue() == "Key: "


def test_provider_setup_flow_saves_tests_and_discovers(tmp_path: Path):
    manager = _empty_manager(tmp_path)
    answers = iter(["4", "polza", "https://api.polza.example/v1"])
    output: list[str] = []
    shown_models: list[list[ModelEntry]] = []
    manager.test_provider_account = AsyncMock(
        return_value={"ok": True, "account_id": "polza", "status": "online"}
    )
    discovered = [
        ModelEntry(
            id="polza:deepseek-v4-flash",
            name="DeepSeek V4 Flash",
            provider="openai_compatible",
            provider_account="polza",
            model="deepseek-v4-flash",
        )
    ]
    manager.discover_and_register_models = AsyncMock(return_value=discovered)
    wizard = ProviderSetupWizard(
        manager,
        ask=lambda *args, **kwargs: next(answers),
        secret_reader=lambda *args, **kwargs: "provider-secret",
        printer=lambda message, *args, **kwargs: output.append(str(message)),
        model_printer=lambda models: shown_models.append(models),
    )

    result = asyncio.run(wizard.run())

    assert result["connection"]["ok"] is True
    assert result["models"] == discovered
    assert manager.accounts.get("polza").provider == "openai_compatible"
    assert manager.accounts.get_api_key("polza") == "provider-secret"
    assert "provider-secret" not in manager.accounts.config_path.read_text(encoding="utf-8")
    assert any("DPAPI" in line for line in output)
    assert any("третьим сторонам" in line for line in output)
    assert shown_models == [discovered]
    manager.test_provider_account.assert_awaited_once_with("polza")
    manager.discover_and_register_models.assert_awaited_once_with("polza")


def test_discovery_always_creates_provider_qualified_id(tmp_path: Path):
    config = tmp_path / "models.yaml"
    config.write_text(
        """
current: cloud
models:
  - id: cloud
    name: Cloud
    provider: openai_compatible
    model: same-model
    type: cloud
    base_url: https://example.invalid/v1
""",
        encoding="utf-8",
    )
    manager = ModelManager(config)
    manager.get_provider("cloud").list_models = AsyncMock(
        return_value=[
            DiscoveredModel(id="same-model", name="Same Model", provider_id="cloud")
        ]
    )

    models = asyncio.run(manager.discover_and_register_models("cloud"))

    assert [model.id for model in models] == ["cloud:same-model"]
    assert manager.use("cloud:same-model").model == "same-model"


def test_provider_setup_cli_aliases_and_management(tmp_path: Path, monkeypatch):
    (tmp_path / "models.yaml").write_text("models: []\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    runtime_module._runtime = None

    async def connected(self, account_id):
        return {"ok": True, "account_id": account_id, "status": "online"}

    async def discovered(self, account_id):
        return [
            ModelEntry(
                id=f"{account_id}:model-a",
                name="Model A",
                provider="openai_compatible",
                provider_account=account_id,
                model="model-a",
            )
        ]

    monkeypatch.setattr(ModelManager, "test_provider_account", connected)
    monkeypatch.setattr(ModelManager, "discover_and_register_models", discovered)
    setup = runner.invoke(
        app,
        ["provider", "setup"],
        input="4\npolza\nhttps://api.polza.example/v1\nprovider-key\n",
    )
    listed = runner.invoke(app, ["providers", "list"])
    tested = runner.invoke(app, ["providers", "test", "polza"])
    removed = runner.invoke(app, ["providers", "remove", "polza", "--delete-key"])
    runtime_module._runtime = None

    assert setup.exit_code == 0
    assert "Nexus Provider Setup Wizard" in setup.stdout
    assert "Windows DPAPI" in setup.stdout
    assert "polza:model-a" in setup.stdout
    assert "polza" in listed.stdout
    assert tested.exit_code == 0
    assert removed.exit_code == 0


def test_plural_provider_setup_command_is_registered():
    result = runner.invoke(app, ["providers", "setup", "--help"])

    assert result.exit_code == 0
    assert "setup wizard" in result.stdout.lower()
