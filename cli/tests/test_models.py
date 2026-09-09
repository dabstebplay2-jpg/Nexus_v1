from pathlib import Path

import pytest

from config.settings import SettingsManager
from models.manager import ModelManager


class FakeBackend:
    def __init__(self):
        self.loaded = False
        self.path = None

    def load(self, path, *, n_ctx, n_gpu_layers):
        self.loaded = True
        self.path = Path(path)
        return {
            "loaded": True,
            "backend": "llama.cpp",
            "device": "CUDA",
            "n_ctx": n_ctx,
            "n_gpu_layers": n_gpu_layers,
        }

    def status(self):
        return {
            "loaded": self.loaded,
            "backend": "llama.cpp",
            "device": "CUDA",
            "model_path": str(self.path),
            "n_ctx": 8192,
            "n_gpu_layers": -1,
        }

    def chat(self, messages, **_options):
        yield messages[-1]["content"]

    def unload(self):
        was_loaded = self.loaded
        self.loaded = False
        return {
            "loaded": False,
            "was_loaded": was_loaded,
            "vram_freed_mib": 6000,
            "vram_after_unload_mib": 1000,
        }


def manager_for(*roots):
    return ModelManager(
        roots=roots,
        backend_factory=FakeBackend,
        backend_available=lambda: True,
    )


def test_scanner_filters_auxiliary_files_and_checkpoints(tmp_path):
    model = tmp_path / "Qwen.gguf"
    model.write_bytes(b"model")
    (tmp_path / "mmproj-F16.gguf").write_bytes(b"projector")
    (tmp_path / "ggml-vocab-test.gguf").write_bytes(b"vocab")
    checkpoint = tmp_path / "checkpoint-10"
    checkpoint.mkdir()
    (checkpoint / "saved.gguf").write_bytes(b"checkpoint")

    manager = manager_for(tmp_path)

    assert [item.name for item in manager.models] == ["Qwen"]
    assert manager.models[0].path == model.resolve()
    assert manager.models[0].status == "READY"


def test_scanner_deduplicates_overlapping_roots_and_has_stable_ids(tmp_path):
    nested = tmp_path / "nested"
    nested.mkdir()
    (nested / "zeta.gguf").write_bytes(b"z")
    (nested / "Alpha.gguf").write_bytes(b"a")

    manager = manager_for(tmp_path, nested)
    first_scan = [(item.id, item.name, item.path) for item in manager.models]
    second_scan = [(item.id, item.name, item.path) for item in manager.scan()]

    assert first_scan == second_scan
    assert [(item.id, item.name) for item in manager.models] == [
        (1, "Alpha"),
        (2, "zeta"),
    ]


def test_manager_lifecycle_and_validation(tmp_path):
    (tmp_path / "model.gguf").write_bytes(b"model")
    manager = manager_for(tmp_path)

    with pytest.raises(ValueError, match="between 1 and 1"):
        manager.load(2)

    status = manager.load(1)
    assert status["loaded"] is True
    assert status["model_name"] == "model"
    assert "hello" == "".join(
        manager.chat([{"role": "user", "content": "hello"}])
    )

    unloaded = manager.unload()
    assert unloaded["was_loaded"] is True
    assert manager.status() == {"loaded": False}


def test_manager_forwards_current_thinking_setting_on_every_turn(tmp_path):
    model_path = tmp_path / "model.gguf"
    model_path.write_bytes(b"model")
    settings = SettingsManager(tmp_path / "settings.json")
    created = []

    class ThinkingBackend(FakeBackend):
        def __init__(self):
            super().__init__()
            self.chat_options = []
            created.append(self)

        def load(self, path, **_options):
            self.loaded = True
            self.path = Path(path)
            return self.status()

        def chat(self, messages, **options):
            self.chat_options.append(dict(options))
            yield messages[-1]["content"]

    manager = ModelManager(
        roots=[tmp_path],
        backend_factory=ThinkingBackend,
        backend_available=lambda: True,
        settings=settings,
    )
    manager.load(1)

    assert "one" == "".join(
        manager.chat([{"role": "user", "content": "one"}])
    )
    settings.set("chat.thinking", False)
    assert "two" == "".join(
        manager.chat([{"role": "user", "content": "two"}])
    )

    assert created[0].chat_options[0]["enable_thinking"] is True
    assert created[0].chat_options[1]["enable_thinking"] is False
