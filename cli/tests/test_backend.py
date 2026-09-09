import sys
from types import SimpleNamespace

from backends.llama_cpp import LlamaCppBackend


class FakeModel:
    def __init__(self):
        self.closed = False
        self.options = None

    def create_chat_completion(self, **options):
        self.options = options
        return iter(
            [
                {"choices": [{"delta": {"role": "assistant"}}]},
                {"choices": [{"delta": {"content": "Hello"}}]},
                {"choices": [{"delta": {"content": "!"}}]},
                {"choices": [{"delta": {}, "finish_reason": "length"}]},
            ]
        )

    def close(self):
        self.closed = True


def test_streaming_chat_uses_coding_defaults():
    backend = LlamaCppBackend(verbose=False)
    backend.model = FakeModel()

    result = "".join(backend.chat([{"role": "user", "content": "Hi"}]))

    assert result == "Hello!"
    assert backend.model.options["stream"] is True
    assert backend.model.options["temperature"] == 0.6
    assert backend.model.options["top_k"] == 20
    assert backend.model.options["max_tokens"] == 1024
    assert backend.last_finish_reason == "length"


def test_streaming_chat_forwards_extended_sampling_options():
    backend = LlamaCppBackend(verbose=False)
    backend.model = FakeModel()

    list(
        backend.chat(
            [{"role": "user", "content": "Hi"}],
            max_tokens=77,
            typical_p=0.8,
            frequency_penalty=0.2,
            tfs_z=0.9,
            mirostat_mode=2,
            mirostat_tau=4.0,
            mirostat_eta=0.05,
            seed=42,
            stop=["END"],
        )
    )

    options = backend.model.options
    assert options["max_tokens"] == 77
    assert options["typical_p"] == 0.8
    assert options["frequency_penalty"] == 0.2
    assert options["mirostat_mode"] == 2
    assert options["seed"] == 42
    assert options["stop"] == ["END"]


def test_unload_closes_model(monkeypatch):
    backend = LlamaCppBackend(verbose=False)
    model = FakeModel()
    backend.model = model
    monkeypatch.setattr(backend, "_nvidia_info", lambda: None)

    result = backend.unload()

    assert model.closed is True
    assert backend.model is None
    assert result["was_loaded"] is True


def test_thinking_is_injected_into_gguf_handler_without_breaking_streaming(
    tmp_path, monkeypatch
):
    model_path = tmp_path / "qwen.gguf"
    model_path.write_bytes(b"gguf")

    class FakeThinkingModel:
        def __init__(self, **options):
            self.options = options
            self.closed = False
            self.chat_format = "chat_template.default"
            self.chat_handler = None
            self.metadata = {
                "tokenizer.chat_template": (
                    "{% if enable_thinking is defined and "
                    "enable_thinking is false %}no{% else %}yes{% endif %}"
                )
            }
            self.handler_calls = []
            self._chat_handlers = {
                self.chat_format: self._base_chat_handler,
            }

        def _base_chat_handler(self, **options):
            self.handler_calls.append(dict(options))
            return iter(
                [
                    {"choices": [{"delta": {"content": "A"}}]},
                    {"choices": [{"delta": {"content": "B"}}]},
                    {
                        "usage": {"completion_tokens": 2},
                        "choices": [{"delta": {}, "finish_reason": "stop"}],
                    },
                ]
            )

        def create_chat_completion(self, **options):
            # llama-cpp-python 0.3.35 does not accept enable_thinking here;
            # it must be injected into the selected chat-template handler.
            assert "enable_thinking" not in options
            handler = self.chat_handler or self._chat_handlers[self.chat_format]
            return handler(llama=self, **options)

        def close(self):
            self.closed = True

    fake_model = FakeThinkingModel()
    fake_llama_cpp = SimpleNamespace(
        Llama=lambda **_options: fake_model,
        llama_print_system_info=lambda: b"AVX2 = 1",
        llama_supports_gpu_offload=lambda: True,
    )
    monkeypatch.setitem(sys.modules, "llama_cpp", fake_llama_cpp)

    gpu_samples = iter(
        [
            {
                "name": "Test GPU",
                "memory_total_mib": 12288,
                "memory_used_mib": 1000,
            },
            {
                "name": "Test GPU",
                "memory_total_mib": 12288,
                "memory_used_mib": 1700,
            },
        ]
    )
    backend = LlamaCppBackend(verbose=False)
    monkeypatch.setattr(backend, "prepare_cuda_runtime", lambda: [])
    monkeypatch.setattr(backend, "_nvidia_info", lambda: next(gpu_samples))

    status = backend.load(model_path)
    disabled = "".join(
        backend.chat(
            [{"role": "user", "content": "Hi"}],
            enable_thinking=False,
        )
    )
    enabled = "".join(
        backend.chat(
            [{"role": "user", "content": "Hi again"}],
            enable_thinking=True,
        )
    )

    assert status["thinking_supported"] is True
    assert disabled == "AB"
    assert enabled == "AB"
    assert [
        call["enable_thinking"] for call in fake_model.handler_calls
    ] == [False, True]
    assert all(call["stream"] is True for call in fake_model.handler_calls)
    assert backend.last_finish_reason == "stop"
    assert backend.last_usage == {"completion_tokens": 2}
