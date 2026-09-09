import json

import pytest

from config.settings import (
    SettingsFileError,
    SettingsManager,
    SettingsValidationError,
)


def test_defaults_and_backend_option_mapping(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")

    assert settings.get("load.n_ctx") == 8192
    assert settings.get("generation.temperature") == 0.6
    assert settings.get("chat.thinking") is True
    assert settings.system_prompt().startswith("You are MiniCursor")
    assert "n_threads" not in settings.load_options()
    assert "chat_format" not in settings.load_options()
    assert "lora_path" not in settings.load_options()
    assert settings.load_options()["lora_scale"] == 1.0
    assert settings.generation_options()["temperature"] == 0.6
    assert settings.train_options()["per_device_train_batch_size"] == 1


def test_thinking_setting_round_trips_as_a_non_reload_boolean(tmp_path):
    path = tmp_path / "settings.json"
    settings = SettingsManager(path)

    assert settings.set("chat.thinking", "off") is False
    assert settings.get("chat.thinking") is False
    assert SettingsManager(path).get("chat.thinking") is False

    restored = SettingsManager(path)
    assert restored.set("chat.thinking", "on") is False
    assert SettingsManager(path).get("chat.thinking") is True


def test_set_parses_cmd_values_persists_and_reports_reload(tmp_path):
    path = tmp_path / "settings.json"
    settings = SettingsManager(path)

    assert settings.set("load.flash_attn", "on") is True
    assert settings.set("generation.temperature", "0.25") is False
    assert settings.set("generation.stop", '["END", "STOP"]') is False
    assert settings.set("load.type_k", "8") is True

    restored = SettingsManager(path)
    assert restored.get("load.flash_attn") is True
    assert restored.get("generation.temp") == 0.25
    assert restored.get("generation.stop") == ["END", "STOP"]
    assert restored.load_options()["type_k"] == 8


def test_invalid_and_unknown_values_do_not_touch_file(tmp_path):
    path = tmp_path / "settings.json"
    settings = SettingsManager(path)
    settings.set("generation.temp", 0.4)
    before = path.read_bytes()

    with pytest.raises(SettingsValidationError, match="Unknown setting"):
        settings.set("generation.magic", 1)
    assert path.read_bytes() == before

    with pytest.raises(SettingsValidationError, match="top_p"):
        settings.set("generation.top_p", 2)
    assert path.read_bytes() == before

    with pytest.raises(SettingsValidationError, match="positive integer"):
        settings.set("load.n_gpu_layers", 0)
    assert path.read_bytes() == before


def test_cross_field_validation_is_atomic(tmp_path):
    path = tmp_path / "settings.json"
    settings = SettingsManager(path)
    settings.set("generation.temp", 0.4)
    before = path.read_bytes()

    with pytest.raises(SettingsValidationError, match="n_ubatch"):
        settings.set("load.n_batch", 128)
    assert settings.get("load.n_batch") == 512
    assert path.read_bytes() == before

    with pytest.raises(SettingsValidationError, match="max_tokens"):
        settings.set("generation.max_tokens", 8192)
    assert settings.get("generation.max_tokens") == 4096
    assert path.read_bytes() == before


def test_sections_format_and_defensive_copies(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")
    generation = settings.values("generation")
    generation["stop"].append("MUTATION")

    assert settings.get("generation.stop") == []
    assert "generation.temp = 0.6" in settings.format("generation")
    assert "load.n_ctx" not in settings.format("generation")
    assert "load.n_ctx = 8192  [reload]" in settings.format()


def test_reset_one_and_all_preserve_custom_profile(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")
    settings.set("load.n_ctx", 16384)
    settings.set("generation.temp", 0.3)
    settings.save_profile("my-code")

    assert settings.reset("generation.temp") is False
    assert settings.get("generation.temp") == 0.6
    assert settings.use_profile("my-code") is False
    assert settings.get("generation.temp") == 0.3
    assert settings.reset() is True
    assert "my-code" in settings.profile_names()


def test_builtin_and_custom_profiles(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")

    assert {"coding", "precise", "creative"}.issubset(settings.profile_names())
    assert settings.use_profile("creative") is False
    assert settings.get("generation.temp") == 0.9
    settings.save_profile("my_profile")
    settings.use_profile("precise")
    assert settings.get("generation.temp") == 0.2
    settings.use_profile("my_profile")
    assert settings.get("generation.temp") == 0.9
    settings.delete_profile("my_profile")
    assert "my_profile" not in settings.profile_names()

    with pytest.raises(SettingsValidationError, match="Built-in"):
        settings.delete_profile("coding")


def test_corrupt_file_raises_and_is_not_overwritten(tmp_path):
    path = tmp_path / "settings.json"
    corrupt = b'{"version": 1, not-json'
    path.write_bytes(corrupt)

    with pytest.raises(SettingsFileError, match="Cannot read settings file"):
        SettingsManager(path)

    assert path.read_bytes() == corrupt


def test_semantically_invalid_file_raises_without_rewrite(tmp_path):
    path = tmp_path / "settings.json"
    document = {
        "version": 1,
        "values": {"load.n_gpu_layers": 0},
        "profiles": {},
    }
    original = json.dumps(document).encode()
    path.write_bytes(original)

    with pytest.raises(SettingsFileError, match="Invalid settings file"):
        SettingsManager(path)

    assert path.read_bytes() == original
