from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator, Sequence

from backends.llama_cpp import LlamaCppBackend


IGNORE_PREFIXES = ("ggml-vocab", "mmproj")
IGNORE_NAMES = {
    "optimizer.pt",
    "rng_state.pth",
    "scheduler.pt",
    "trainer_state.json",
}


@dataclass(frozen=True)
class ModelRecord:
    id: int
    name: str
    type: str
    backend: str
    path: Path
    size_bytes: int
    status: str


class ModelManager:
    def __init__(
        self,
        *,
        roots: Sequence[str | Path] | None = None,
        backend_factory: Callable[[], Any] = LlamaCppBackend,
        backend_available: Callable[[], bool] = LlamaCppBackend.dependency_available,
        settings: Any | None = None,
    ) -> None:
        project_root = Path(__file__).resolve().parents[1]
        self.roots = [
            Path(root).expanduser().resolve()
            for root in (
                roots
                if roots is not None
                else (
                    project_root / "models",
                    Path.home() / ".cache" / "huggingface" / "hub",
                )
            )
        ]
        self.backend_factory = backend_factory
        self.backend_available = backend_available
        self.settings = settings
        self.models: list[ModelRecord] = []
        self.backend: Any | None = None
        self.active: ModelRecord | None = None
        self.scan()

    def _configured_load_options(self) -> dict[str, Any]:
        if self.settings is None:
            return {"n_ctx": 8192, "n_gpu_layers": -1}
        options = self.settings.load_options()
        # Settings uses omission to mean "llama.cpp default".  Make those
        # defaults explicit here so status can also detect resetting a value.
        for key in (
            "n_threads",
            "n_threads_batch",
            "type_k",
            "type_v",
            "chat_format",
            "lora_path",
        ):
            options.setdefault(key, None)
        return options

    @staticmethod
    def _ignored(path: Path) -> bool:
        lower_name = path.name.lower()
        if lower_name in IGNORE_NAMES:
            return True
        if lower_name.startswith(IGNORE_PREFIXES):
            return True
        return any(part.lower().startswith("checkpoint-") for part in path.parts)

    def scan(self) -> list[ModelRecord]:
        discovered: dict[str, Path] = {}
        for root in self.roots:
            if not root.is_dir():
                continue
            for candidate in root.rglob("*.gguf"):
                if not candidate.is_file() or self._ignored(candidate):
                    continue
                resolved = candidate.resolve()
                discovered[str(resolved).casefold()] = resolved

        paths = sorted(
            discovered.values(),
            key=lambda item: (item.stem.casefold(), str(item).casefold()),
        )
        ready = self.backend_available()
        self.models = [
            ModelRecord(
                id=index,
                name=path.stem,
                type="GGUF",
                backend="llama.cpp",
                path=path,
                size_bytes=path.stat().st_size,
                status="READY" if ready else "BACKEND NOT INSTALLED",
            )
            for index, path in enumerate(paths, 1)
        ]
        return self.models

    def get(self, index: int) -> ModelRecord:
        if index < 1 or index > len(self.models):
            raise ValueError(
                f"Model id must be between 1 and {len(self.models)}"
                if self.models
                else "No GGUF models were found"
            )
        return self.models[index - 1]

    def format_models(self) -> str:
        if not self.models:
            return "No GGUF models found"

        blocks = []
        for model in self.models:
            blocks.append(
                "\n".join(
                    [
                        f"[{model.id}] {model.name}",
                        f"Type: {model.type}",
                        f"Backend: {model.backend}",
                        f"Size: {model.size_bytes / (1024 ** 3):.2f} GiB",
                        f"Status: {model.status}",
                    ]
                )
            )
        return "Models:\n\n" + "\n\n".join(blocks)

    def show(self) -> None:
        print(self.format_models())

    def load(
        self,
        index: int,
        *,
        progress: Callable[[str], None] | None = None,
        force: bool = False,
    ) -> dict[str, Any]:
        selected = self.get(index)
        notify = progress or (lambda _message: None)
        load_options = self._configured_load_options()

        if self.active == selected and self.backend is not None and not force:
            applied = self.backend.status().get("load_parameters")
            if not applied or all(
                applied.get(key) == value for key, value in load_options.items()
            ):
                return self.status()
            notify("Load settings changed; reloading the model")

        if self.backend is not None:
            notify("Unloading current model")
            self.unload()

        notify(f"Selected: {selected.name}")
        notify("Backend: llama.cpp")
        notify("Checking CUDA support")
        candidate_backend = self.backend_factory()
        gpu_layers = load_options.get("n_gpu_layers", -1)
        layer_text = "all layers" if gpu_layers == -1 else f"{gpu_layers} layers"
        notify(f"Loading GGUF with {layer_text} on GPU")
        try:
            result = candidate_backend.load(selected.path, **load_options)
        except Exception:
            close = getattr(candidate_backend, "unload", None)
            if callable(close):
                close()
            raise

        self.backend = candidate_backend
        self.active = selected
        notify("READY")
        return {**result, "model_name": selected.name}

    def chat(
        self,
        messages: Sequence[dict[str, str]],
        **generation_options: Any,
    ) -> Iterator[str]:
        if self.backend is None or self.active is None:
            raise RuntimeError("Load a model before starting chat")
        configured = (
            self.settings.generation_options() if self.settings is not None else {}
        )
        if self.settings is not None:
            configured["enable_thinking"] = bool(
                self.settings.get("chat.thinking")
            )
        configured.update(generation_options)
        return self.backend.chat(messages, **configured)

    def reload(
        self, *, progress: Callable[[str], None] | None = None
    ) -> dict[str, Any]:
        if self.active is None:
            raise RuntimeError("Load a model before using reload")
        return self.load(self.active.id, progress=progress, force=True)

    def finish_reason(self) -> str | None:
        if self.backend is None:
            return None
        return getattr(self.backend, "last_finish_reason", None)

    def unload(self) -> dict[str, Any]:
        if self.backend is None:
            self.active = None
            return {
                "loaded": False,
                "was_loaded": False,
                "vram_freed_mib": 0,
                "vram_after_unload_mib": None,
            }
        result = self.backend.unload()
        self.backend = None
        self.active = None
        return result

    def status(self) -> dict[str, Any]:
        if self.backend is None or self.active is None:
            if self.settings is None:
                return {"loaded": False}
            return {
                "loaded": False,
                "configured_load": self._configured_load_options(),
                "thinking_enabled": bool(self.settings.get("chat.thinking")),
            }
        status = {
            **self.backend.status(),
            "model_id": self.active.id,
            "model_name": self.active.name,
        }
        configured = self._configured_load_options() if self.settings is not None else None
        status["configured_load"] = configured
        if self.settings is not None:
            status["thinking_enabled"] = bool(
                self.settings.get("chat.thinking")
            )
        if configured is not None:
            applied = status.get("load_parameters", {})
            status["reload_required"] = any(
                applied.get(key) != value for key, value in configured.items()
            )
        return status
