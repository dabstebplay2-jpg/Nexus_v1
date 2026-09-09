import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from nexus.models.manager import ModelManager
from nexus.models.secrets import SecretStore
from nexus.models.types import DiscoveredModel, ModelEntry, ModelStatus


def _write_config(path: Path) -> None:
    path.write_text(
        """
current: gpt5
models:
  - id: gpt5
    name: GPT-5
    provider: openai
    model: gpt-5
    type: cloud
    api_key_env: OPENAI_API_KEY
  - id: qwen
    name: Qwen Coder
    provider: ollama
    model: qwen2.5-coder
    type: local
    base_url: http://localhost:11434
""",
        encoding="utf-8",
    )


def test_model_manager_reload(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)
    assert manager.current_id() == "gpt5"
    assert manager.registry.count() == 2
    assert all(isinstance(entry, ModelEntry) for entry in manager.list())

    config.write_text(
        "current: qwen\nmodels:\n  - id: qwen\n    name: Qwen\n    provider: ollama\n    model: qwen\n    type: local\n",
        encoding="utf-8",
    )
    manager.reload()
    assert manager.current_id() == "qwen"
    assert manager.list_ids() == ["qwen"]


def test_manager_use_changes_current(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)
    entry = manager.use("qwen")
    assert entry.id == "qwen"
    assert manager.current_id() == "qwen"


def test_manager_add_and_remove(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)

    new_entry = ModelEntry(
        id="custom",
        name="Custom",
        provider="openai_compatible",
        model="custom-model",
        type="cloud",
        base_url="http://localhost:9999/v1",
    )
    manager.add(new_entry)
    assert manager.get("custom") is not None
    assert manager.remove("custom") is True
    assert manager.get("custom") is None


def test_manager_no_auto_selection(tmp_path: Path):
    config = tmp_path / "models.yaml"
    config.write_text("models:\n  - id: a\n    name: A\n    provider: ollama\n    model: a\n    type: local\n", encoding="utf-8")
    manager = ModelManager(config_path=config)
    assert manager.current_id() == "a"


def test_manager_check_connection(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)

    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("nexus.models.providers.openai.http_get", new_callable=AsyncMock, return_value=mock_response):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}):
            connected = asyncio.run(manager.check_connection("gpt5"))
            assert connected is True
            assert manager.get("gpt5").status == ModelStatus.CONNECTED.value


def test_manager_test_offline(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)

    with patch("nexus.models.providers.ollama.http_get", new_callable=AsyncMock, side_effect=ConnectionError("offline")):
        result = asyncio.run(manager.test("qwen"))
        assert result["ok"] is False


def test_manager_generate_requires_selection(tmp_path: Path):
    config = tmp_path / "models.yaml"
    config.write_text("models: []\n", encoding="utf-8")
    manager = ModelManager(config_path=config)
    try:
        manager.get_provider()
        raised = False
    except RuntimeError:
        raised = True
    assert raised


def test_manager_doctor(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(config_path=config)

    result = manager.doctor()

    assert all(result["checks"].values())
    assert result["warnings"] == []


def test_manager_saves_and_masks_api_key(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    config = tmp_path / "models.yaml"
    _write_config(config)
    secrets = SecretStore(tmp_path / ".nexus" / "secrets.yaml")
    manager = ModelManager(config_path=config, secret_store=secrets)

    info = manager.set_api_key("gpt5", "sk-test-1234567890")

    assert info["configured"] is True
    assert info["value"] == "sk-t...7890"
    assert manager.api_key_info("gpt5", reveal=True)["value"] == "sk-test-1234567890"
    assert manager.get_provider("gpt5").secrets is secrets
    assert "sk-test-1234567890" not in config.read_text(encoding="utf-8")
    assert secrets.path.exists()

    assert manager.delete_api_key("gpt5") is True
    assert manager.api_key_info("gpt5")["configured"] is False


def test_manager_discovers_and_selects_provider_model(tmp_path: Path):
    config = tmp_path / "models.yaml"
    _write_config(config)
    manager = ModelManager(
        config_path=config,
        secret_store=SecretStore(tmp_path / ".nexus" / "secrets.yaml"),
    )
    manager.set_api_key("gpt5", "shared-provider-key")
    provider = manager.get_provider("gpt5")
    provider.list_models = AsyncMock(
        return_value=[
            DiscoveredModel(id="remote-a", name="Remote A", provider_id="gpt5"),
            DiscoveredModel(id="remote-b", name="Remote B", provider_id="gpt5"),
        ]
    )

    discovered = asyncio.run(manager.discover_and_register_models("gpt5"))
    selected = manager.use(discovered[1].id)

    assert [model.id for model in discovered] == ["gpt5:remote-a", "gpt5:remote-b"]
    assert selected.model == "remote-b"
    assert manager.current_id() == "gpt5:remote-b"
    assert manager.get("gpt5").model == "gpt-5"
    assert manager.get_api_key("gpt5:remote-a") == "shared-provider-key"
    assert manager.get_provider("gpt5:remote-b").entry.model == "remote-b"
    assert "gpt5:remote-a" in config.read_text(encoding="utf-8")
    assert "gpt5:remote-a" not in {
        item["model_id"] for item in manager.list_api_keys()
    }

    manager.set_api_key("gpt5", "rotated-provider-key")
    assert manager.get_api_key("gpt5:remote-a") == "rotated-provider-key"

    assert manager.delete_api_key("gpt5") is True
    assert manager.get("gpt5").api_key_ref is None
    assert manager.get("gpt5:remote-a").api_key_ref is None
