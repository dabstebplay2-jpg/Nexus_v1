import json
from pathlib import Path

import pytest
import yaml

from nexus.models.config import ModelConfigError, load_models_config, save_models_config
from nexus.models.migration import MIGRATION_SUCCESS_MESSAGE, migrate_legacy_config
from nexus.models.types import ModelEntry


def test_models_config_yaml(tmp_path: Path):
    config_path = tmp_path / "models.yaml"
    entries = [
        ModelEntry(
            id="gpt5",
            name="GPT-5",
            provider="openai",
            model="gpt-5",
            type="cloud",
            context_length=128000,
        ),
        ModelEntry(
            id="qwen",
            name="Qwen Coder",
            provider="ollama",
            model="qwen2.5-coder",
            type="local",
        ),
    ]

    save_models_config(entries, current="gpt5", path=config_path)
    current, loaded = load_models_config(config_path)

    assert current == "gpt5"
    assert [entry.id for entry in loaded] == ["gpt5", "qwen"]
    assert loaded[0].context_length == 128000
    assert all(isinstance(entry, ModelEntry) for entry in loaded)


def test_json_migration(tmp_path: Path):
    legacy_path = tmp_path / ".nexus" / "models.json"
    legacy_path.parent.mkdir(parents=True)
    legacy_payload = [{"id": "qwen", "provider": "ollama", "type": "local"}]
    legacy_path.write_text(json.dumps(legacy_payload), encoding="utf-8")
    config_path = tmp_path / "models.yaml"
    messages = []

    result = migrate_legacy_config(
        config_path=config_path,
        legacy_path=legacy_path,
        reporter=messages.append,
    )

    assert result.migrated is True
    assert result.backup_path is not None and result.backup_path.exists()
    assert result.backup_path.name.startswith("models_backup_")
    assert messages == [MIGRATION_SUCCESS_MESSAGE]
    current, entries = load_models_config(config_path)
    assert current == "qwen"
    assert entries[0].id == "qwen"


def test_migration_does_not_overwrite_yaml(tmp_path: Path):
    config_path = tmp_path / "models.yaml"
    save_models_config([ModelEntry(id="canonical")], current="canonical", path=config_path)
    legacy_path = tmp_path / ".nexus" / "models.json"
    legacy_path.parent.mkdir(parents=True)
    legacy_path.write_text('[{"id": "legacy"}]', encoding="utf-8")

    result = migrate_legacy_config(config_path, legacy_path, reporter=None)

    assert result.migrated is False
    assert result.legacy_detected is True
    assert load_models_config(config_path)[1][0].id == "canonical"


def test_json_is_rejected_by_runtime_config(tmp_path: Path):
    with pytest.raises(ModelConfigError, match="must be YAML"):
        load_models_config(tmp_path / "models.json")


def test_load_missing_config(tmp_path: Path):
    assert load_models_config(tmp_path / "missing.yaml") == (None, [])


def test_model_entry_roundtrip():
    entry = ModelEntry(
        id="gpt5",
        name="GPT-5",
        provider="openai",
        model="gpt-5",
        type="cloud",
        capabilities=["coding"],
        status="online",
        context_length=128000,
        api_key_env="OPENAI_API_KEY",
    )
    restored = ModelEntry.from_dict(entry.to_dict())
    assert restored == entry


def test_project_models_yaml_exists():
    config_path = Path("models.yaml")
    assert config_path.exists()
    data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert len(data["models"]) >= 2
    assert data.get("current")
