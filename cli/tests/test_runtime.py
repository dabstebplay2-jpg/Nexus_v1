from core.runtime import MiniCursor, split_command
from config.settings import SettingsManager


class FakeManager:
    def __init__(self):
        self.loaded = False
        self.messages = []
        self.unload_calls = 0
        self.finish = None

    def scan(self):
        return []

    def format_models(self):
        return "Models:\n\n[1] fake"

    def load(self, model_id, *, progress):
        if model_id != 1:
            raise ValueError("bad model")
        progress("READY")
        self.loaded = True
        return self.status()

    def status(self):
        if not self.loaded:
            return {"loaded": False}
        return {
            "loaded": True,
            "model_name": "fake",
            "backend": "llama.cpp",
            "device": "CUDA",
            "gpu_name": "Test GPU",
            "n_ctx": 8192,
            "n_gpu_layers": -1,
            "vram_delta_mib": 6000,
            "model_path": "fake.gguf",
        }

    def chat(self, messages, **_options):
        self.messages.append(list(messages))
        yield "answer"

    def unload(self):
        self.unload_calls += 1
        was_loaded = self.loaded
        self.loaded = False
        return {"was_loaded": was_loaded, "vram_freed_mib": 6000}

    def finish_reason(self):
        return self.finish


class Recorder:
    def __init__(self):
        self.parts = []

    def __call__(self, value="", *, end="\n", **_kwargs):
        self.parts.append(str(value) + end)

    @property
    def text(self):
        return "".join(self.parts)


def test_windows_command_parser_preserves_quoted_paths():
    assert split_command(r'train validate "C:\My Data\set.jsonl"') == [
        "train",
        "validate",
        r"C:\My Data\set.jsonl",
    ]


def test_invalid_load_does_not_crash():
    output = Recorder()
    runtime = MiniCursor(models=FakeManager(), output_fn=output)

    assert runtime.handle_command("load nope") is True
    assert "Model id must be an integer" in output.text


def test_interactive_chat_clear_and_exit():
    manager = FakeManager()
    manager.loaded = True
    output = Recorder()
    inputs = iter(["first", "/clear", "second", "/exit"])
    runtime = MiniCursor(
        models=manager,
        input_fn=lambda _prompt: next(inputs),
        output_fn=output,
    )

    runtime.chat_mode()

    assert len(manager.messages) == 2
    assert manager.messages[0][-1] == {"role": "user", "content": "first"}
    assert manager.messages[1][-1] == {"role": "user", "content": "second"}
    assert not any(message.get("content") == "first" for message in manager.messages[1])
    assert "Chat history cleared" in output.text


def test_exit_always_unloads():
    manager = FakeManager()
    output = Recorder()
    runtime = MiniCursor(
        models=manager,
        input_fn=lambda _prompt: "exit",
        output_fn=output,
    )

    runtime.start()

    assert manager.unload_calls == 1


def test_config_commands_persist_and_report_reload(tmp_path):
    manager = FakeManager()
    manager.loaded = True
    settings = SettingsManager(tmp_path / "settings.json")
    output = Recorder()
    runtime = MiniCursor(models=manager, settings=settings, output_fn=output)

    runtime.handle_command("config set generation.temperature 0.25")
    runtime.handle_command("config set load.n_ctx 16384")

    assert settings.get("generation.temp") == 0.25
    assert settings.get("load.n_ctx") == 16384
    assert "next response" in output.text
    assert "after 'reload'" in output.text


def test_top_level_thinking_commands_toggle_and_report_status(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")
    output = Recorder()
    runtime = MiniCursor(
        models=FakeManager(),
        settings=settings,
        output_fn=output,
    )

    runtime.handle_command("thinking status")
    runtime.handle_command("thinking off")
    assert settings.get("chat.thinking") is False
    runtime.handle_command("thinking on")
    assert settings.get("chat.thinking") is True

    rendered = output.text.upper()
    assert "THINKING" in rendered
    assert "ON" in rendered
    assert "OFF" in rendered


def test_chat_think_commands_change_mode_without_becoming_messages(tmp_path):
    settings = SettingsManager(tmp_path / "settings.json")

    class ModeRecordingManager(FakeManager):
        def __init__(self):
            super().__init__()
            self.modes = []

        def chat(self, messages, **options):
            self.messages.append(list(messages))
            self.modes.append(
                options.get("enable_thinking", settings.get("chat.thinking"))
            )
            yield "answer"

    manager = ModeRecordingManager()
    manager.loaded = True
    output = Recorder()
    inputs = iter(
        ["first", "/nothink", "second", "/think", "third", "/exit"]
    )
    runtime = MiniCursor(
        models=manager,
        settings=settings,
        input_fn=lambda _prompt: next(inputs),
        output_fn=output,
    )

    runtime.chat_mode()

    assert manager.modes == [True, False, True]
    assert len(manager.messages) == 3
    all_contents = [
        message.get("content")
        for call in manager.messages
        for message in call
    ]
    assert "/think" not in all_contents
    assert "/nothink" not in all_contents
    assert [
        message["content"]
        for message in manager.messages[-1]
        if message["role"] == "user"
    ] == ["first", "second", "third"]
    assert settings.get("chat.thinking") is True


def test_chat_reports_length_truncation(tmp_path):
    manager = FakeManager()
    manager.loaded = True
    manager.finish = "length"
    settings = SettingsManager(tmp_path / "settings.json")
    output = Recorder()
    inputs = iter(["hello", "/exit"])
    runtime = MiniCursor(
        models=manager,
        settings=settings,
        input_fn=lambda _prompt: next(inputs),
        output_fn=output,
    )

    runtime.chat_mode()

    assert "reached max_tokens" in output.text


class DryRunTrainer:
    def __init__(self):
        self.start_calls = 0

    def plan(self, _dataset_ref=None, **_kwargs):
        return {
            "ready": True,
            "mode": "new",
            "base_model": "cached/base",
            "dataset": {"path": "data.jsonl", "record_count": 2},
            "training": {
                "max_seq_length": 512,
                "per_device_train_batch_size": 1,
                "gradient_accumulation_steps": 8,
                "num_train_epochs": 1,
                "max_steps": 1,
                "lora_r": 8,
                "lora_alpha": 8,
            },
            "warnings": [],
            "errors": [],
        }

    def start(self, *_args, **_kwargs):
        self.start_calls += 1
        raise AssertionError("dry-run must not start a worker")


def test_train_dry_run_does_not_start_or_unload(tmp_path):
    manager = FakeManager()
    manager.loaded = True
    trainer = DryRunTrainer()
    output = Recorder()
    runtime = MiniCursor(
        models=manager,
        settings=SettingsManager(tmp_path / "settings.json"),
        training=trainer,
        output_fn=output,
    )

    runtime.handle_command("train start D1 --dry-run")

    assert trainer.start_calls == 0
    assert manager.unload_calls == 0
    assert "nothing was created, loaded, or unloaded" in output.text


def test_train_export_can_select_gguf_lora(tmp_path):
    class ExportTrainer:
        def export_adapter(self, reference, *, outtype):
            assert reference == "A1"
            assert outtype == "f16"
            return {
                "path": str(tmp_path / "adapter.gguf"),
                "size_bytes": 4096,
                "cached": False,
            }

    manager = FakeManager()
    manager.loaded = True
    settings = SettingsManager(tmp_path / "settings.json")
    output = Recorder()
    runtime = MiniCursor(
        models=manager,
        settings=settings,
        training=ExportTrainer(),
        output_fn=output,
    )

    runtime.handle_command("train export A1 f16 --use")

    assert settings.get("load.lora_path") == str(tmp_path / "adapter.gguf")
    assert "Run 'reload'" in output.text
