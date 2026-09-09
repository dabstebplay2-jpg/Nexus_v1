import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import yaml
from typer.testing import CliRunner

import nexus.core.runtime as runtime_module
from nexus.cli.main import app
from nexus.models.accounts import ProviderAccountManager
from nexus.models.manager import ModelManager
from nexus.models.secrets import SecretStore
from nexus.models.types import DiscoveredModel, ProviderAccount


runner = CliRunner()


def test_secure_key_store_does_not_persist_plaintext(tmp_path: Path):
    store = SecretStore(tmp_path / "secrets.yaml")
    store.set("provider:cloud", "super-secret-api-key")

    assert store.get("provider:cloud") == "super-secret-api-key"
    assert "super-secret-api-key" not in store.path.read_text(encoding="utf-8")


def test_provider_account_manager_separates_connection_and_key(tmp_path: Path):
    secrets = SecretStore(tmp_path / "secrets.yaml")
    config = tmp_path / "providers.yaml"
    manager = ProviderAccountManager(config, secret_store=secrets)
    manager.add(
        ProviderAccount(
            id="edge",
            provider="openai_compatible",
            base_url="https://edge.example/v1",
        ),
        api_key="edge-secret",
    )

    payload = yaml.safe_load(config.read_text(encoding="utf-8"))
    assert payload["version"] == 7
    assert payload["accounts"][0]["api_key_ref"] == "provider:edge"
    assert "edge-secret" not in config.read_text(encoding="utf-8")
    assert manager.get_api_key("edge") == "edge-secret"


def test_model_manager_bootstraps_accounts_from_v6(tmp_path: Path):
    model_config = tmp_path / "models.yaml"
    model_config.write_text(
        """
current: qwen
models:
  - id: qwen
    name: Qwen
    provider: ollama
    model: qwen
    type: local
    base_url: http://localhost:11434
""",
        encoding="utf-8",
    )
    manager = ModelManager(model_config)

    assert manager.get("qwen").provider_account == "qwen"
    assert manager.accounts.get("qwen").provider == "ollama"
    assert (tmp_path / ".nexus" / "providers.yaml").exists()


def test_v7_model_uses_provider_account_connection(tmp_path: Path):
    model_config = tmp_path / "models.yaml"
    provider_config = tmp_path / "providers.yaml"
    model_config.write_text(
        """
current: edge:coder
models:
  - id: edge:coder
    name: Edge Coder
    provider_account: edge
    model: coder
    type: cloud
""",
        encoding="utf-8",
    )
    provider_config.write_text(
        """
version: 7
accounts:
  - id: edge
    name: Edge
    provider: openai_compatible
    base_url: https://edge.example/v1
""",
        encoding="utf-8",
    )
    manager = ModelManager(model_config, provider_config_path=provider_config)

    assert manager.current_id() == "edge:coder"
    assert manager.get("edge:coder").provider == "openai_compatible"
    assert manager.get_provider("edge:coder").base_url == "https://edge.example/v1"


def test_discovery_populates_qualified_model_catalog(tmp_path: Path):
    model_config = tmp_path / "models.yaml"
    model_config.write_text("models: []\n", encoding="utf-8")
    manager = ModelManager(model_config)
    manager.add_provider_account(
        ProviderAccount(
            id="cloud",
            provider="openai_compatible",
            base_url="https://cloud.example/v1",
        )
    )
    manager.accounts.discover = AsyncMock(
        return_value=[
            DiscoveredModel(id="model-a", name="Model A", provider_id="cloud"),
            DiscoveredModel(id="model-b", name="Model B", provider_id="cloud"),
        ]
    )

    discovered = asyncio.run(manager.discover_and_register_models("cloud"))
    selected = manager.use("cloud:model-b")

    assert [entry.id for entry in discovered] == ["cloud:model-a", "cloud:model-b"]
    assert selected.model == "model-b"
    assert manager.catalog.list("cloud") == discovered


def test_provider_cli_add_and_list(tmp_path: Path, monkeypatch):
    (tmp_path / "models.yaml").write_text("models: []\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    runtime_module._runtime = None
    add_result = runner.invoke(
        app,
        ["providers", "add", "--id", "local", "--provider", "ollama"],
    )
    list_result = runner.invoke(app, ["providers", "list"])
    runtime_module._runtime = None

    assert add_result.exit_code == 0
    assert list_result.exit_code == 0
    assert "local" in list_result.stdout
    assert "ollama" in list_result.stdout
