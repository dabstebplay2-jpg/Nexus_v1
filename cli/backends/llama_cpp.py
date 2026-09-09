from __future__ import annotations

import gc
import importlib.util
import os
import subprocess
import sys
import time
import ctypes
from pathlib import Path
from typing import Any, Iterator, Sequence


_DLL_DIRECTORY_HANDLES: list[Any] = []
_DLL_DIRECTORY_PATHS: set[str] = set()


class LlamaCppBackend:
    """CUDA-only llama.cpp backend for local GGUF models."""

    def __init__(self, *, verbose: bool = False) -> None:
        self.model: Any | None = None
        self.model_path: Path | None = None
        self.n_ctx: int | None = None
        self.n_gpu_layers: int | None = None
        self.gpu_name: str | None = None
        self.gpu_memory_total_mib: int | None = None
        self.vram_before_mib: int | None = None
        self.vram_loaded_mib: int | None = None
        self.vram_after_unload_mib: int | None = None
        self.cuda_supported = False
        self.verbose = verbose
        self.load_parameters: dict[str, Any] = {}
        self.last_finish_reason: str | None = None
        self.last_usage: dict[str, Any] | None = None
        self.thinking_supported = False
        self.thinking_enabled = False
        self._base_chat_handler: Any | None = None

    def _install_thinking_handler(self, model: Any, llama_cpp: Any) -> None:
        """Inject per-request Qwen thinking state into a GGUF Jinja handler.

        llama-cpp-python 0.3.35 does not expose ``chat_template_kwargs`` on
        ``create_chat_completion``.  Its own server implements the feature by
        wrapping the selected chat handler, so the direct backend mirrors that
        mechanism here.
        """

        metadata = getattr(model, "metadata", {}) or {}
        template = str(metadata.get("tokenizer.chat_template", ""))
        self.thinking_supported = "enable_thinking" in template
        self._base_chat_handler = None
        if not self.thinking_supported:
            return

        handlers = getattr(model, "_chat_handlers", {}) or {}
        chat_format = getattr(model, "chat_format", None)
        base_handler = getattr(model, "chat_handler", None) or handlers.get(
            chat_format
        )
        if base_handler is None:
            formatter_module = getattr(llama_cpp, "llama_chat_format", None)
            resolver = getattr(formatter_module, "get_chat_completion_handler", None)
            if callable(resolver):
                base_handler = resolver(chat_format)
        if not callable(base_handler):
            raise RuntimeError(
                "The GGUF advertises thinking mode, but its chat-template "
                "handler could not be resolved"
            )

        self._base_chat_handler = base_handler

        def chat_handler_with_thinking(*args: Any, **kwargs: Any) -> Any:
            options = dict(kwargs)
            options["enable_thinking"] = self.thinking_enabled
            return base_handler(*args, **options)

        model.chat_handler = chat_handler_with_thinking

    @staticmethod
    def dependency_available() -> bool:
        return importlib.util.find_spec("llama_cpp") is not None

    @staticmethod
    def prepare_cuda_runtime() -> list[Path]:
        """Expose CUDA DLLs installed by NVIDIA's Python runtime packages."""
        if sys.platform != "win32":
            return []

        nvidia_root = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
        directories = sorted(
            directory.resolve()
            for directory in nvidia_root.glob("*/bin")
            if directory.is_dir()
        )
        current_path = os.environ.get("PATH", "").split(os.pathsep)
        for directory in directories:
            directory_text = str(directory)
            if directory_text not in current_path:
                os.environ["PATH"] = directory_text + os.pathsep + os.environ.get(
                    "PATH", ""
                )
                current_path.insert(0, directory_text)
            if directory_text in _DLL_DIRECTORY_PATHS:
                continue
            try:
                _DLL_DIRECTORY_HANDLES.append(os.add_dll_directory(directory_text))
                _DLL_DIRECTORY_PATHS.add(directory_text)
            except (AttributeError, FileNotFoundError, OSError):
                continue
        return directories

    @staticmethod
    def _cpu_supports_avx512() -> bool:
        if sys.platform != "win32":
            return True
        try:
            # PF_AVX512F_INSTRUCTIONS_AVAILABLE from the Windows SDK.
            return bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(41))
        except (AttributeError, OSError):
            return False

    @staticmethod
    def _nvidia_info() -> dict[str, Any] | None:
        try:
            result = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,memory.used",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                check=True,
                timeout=10,
            )
            first_gpu = next(
                line for line in result.stdout.splitlines() if line.strip()
            )
            name, total, used = (part.strip() for part in first_gpu.split(",", 2))
            return {
                "name": name,
                "memory_total_mib": int(total),
                "memory_used_mib": int(used),
            }
        except (OSError, ValueError, StopIteration, subprocess.SubprocessError):
            return None

    def load(
        self,
        path: str | Path,
        *,
        n_ctx: int = 8192,
        n_gpu_layers: int = -1,
        n_batch: int = 512,
        n_ubatch: int = 512,
        n_threads: int | None = None,
        n_threads_batch: int | None = None,
        flash_attn: bool = False,
        offload_kqv: bool = True,
        use_mmap: bool = True,
        use_mlock: bool = False,
        seed: int = -1,
        type_k: int | None = None,
        type_v: int | None = None,
        chat_format: str | None = None,
        lora_path: str | Path | None = None,
        lora_scale: float = 1.0,
        verbose: bool | None = None,
    ) -> dict[str, Any]:
        model_path = Path(path).expanduser().resolve()
        if not model_path.is_file() or model_path.suffix.lower() != ".gguf":
            raise RuntimeError(f"GGUF model not found: {model_path}")
        if n_gpu_layers == 0 or n_gpu_layers < -1:
            raise RuntimeError(
                "n_gpu_layers must be -1 (all layers) or a positive number; "
                "CPU-only mode is disabled"
            )
        if n_ubatch > n_batch or n_batch > n_ctx:
            raise RuntimeError("Require n_ubatch <= n_batch <= n_ctx")
        resolved_lora: Path | None = None
        if lora_path:
            resolved_lora = Path(lora_path).expanduser().resolve()
            if not resolved_lora.is_file() or resolved_lora.suffix.lower() != ".gguf":
                raise RuntimeError(
                    "llama.cpp LoRA must be an existing .gguf adapter; PEFT "
                    "adapter_model.safetensors must be exported first"
                )

        self.prepare_cuda_runtime()
        try:
            import llama_cpp
        except (ImportError, OSError, RuntimeError) as exc:
            raise RuntimeError(
                "CUDA llama-cpp-python is unavailable. Install the project "
                "dependencies inside .venv as described in README.md."
            ) from exc

        compiled_features = llama_cpp.llama_print_system_info().decode(
            errors="replace"
        )
        if "AVX512 = 1" in compiled_features and not self._cpu_supports_avx512():
            raise RuntimeError(
                "The installed CUDA wheel contains an AVX-512 CPU backend, but "
                "this CPU supports AVX2 only. Run "
                "'.venv\\Scripts\\python.exe scripts\\prepare_windows_cuda.py'."
            )

        supports_offload = getattr(llama_cpp, "llama_supports_gpu_offload", None)
        if not callable(supports_offload) or not supports_offload():
            raise RuntimeError(
                "The installed llama-cpp-python build has no GPU offload support. "
                "CPU fallback is disabled."
            )

        gpu = self._nvidia_info()
        if gpu is None:
            raise RuntimeError(
                "No NVIDIA GPU is visible through nvidia-smi. CPU fallback is disabled."
            )

        if self.model is not None:
            self.unload()

        self.cuda_supported = True
        self.gpu_name = gpu["name"]
        self.gpu_memory_total_mib = gpu["memory_total_mib"]
        self.vram_before_mib = gpu["memory_used_mib"]

        try:
            llama_options: dict[str, Any] = {
                "model_path": str(model_path),
                "n_ctx": n_ctx,
                "n_gpu_layers": n_gpu_layers,
                "n_batch": n_batch,
                "n_ubatch": n_ubatch,
                "n_threads": n_threads,
                "n_threads_batch": n_threads_batch,
                "flash_attn": flash_attn,
                "offload_kqv": offload_kqv,
                "use_mmap": use_mmap,
                "use_mlock": use_mlock,
                # llama.cpp uses UINT32_MAX as its random-seed sentinel.
                "seed": 0xFFFFFFFF if seed == -1 else seed,
                "verbose": self.verbose if verbose is None else verbose,
            }
            if type_k is not None:
                llama_options["type_k"] = type_k
            if type_v is not None:
                llama_options["type_v"] = type_v
            if chat_format:
                llama_options["chat_format"] = chat_format
            if resolved_lora is not None:
                llama_options["lora_path"] = str(resolved_lora)
                llama_options["lora_scale"] = lora_scale

            model = llama_cpp.Llama(**llama_options)
            self._install_thinking_handler(model, llama_cpp)
            loaded_gpu = self._nvidia_info()
            self.vram_loaded_mib = (
                loaded_gpu["memory_used_mib"] if loaded_gpu is not None else None
            )

            if (
                self.vram_loaded_mib is not None
                and self.vram_before_mib is not None
                and self.vram_loaded_mib - self.vram_before_mib
                < (512 if n_gpu_layers == -1 else 64)
            ):
                model.close()
                raise RuntimeError(
                    "Model initialized, but NVIDIA VRAM did not increase enough to "
                    "confirm GPU offload. CPU fallback is disabled."
                )
        except Exception as exc:
            self.model = None
            self.model_path = None
            gc.collect()
            if isinstance(exc, RuntimeError):
                raise
            raise RuntimeError(f"Failed to load GGUF model: {exc}") from exc

        self.model = model
        self.model_path = model_path
        self.n_ctx = n_ctx
        self.n_gpu_layers = n_gpu_layers
        self.load_parameters = {
            "n_ctx": n_ctx,
            "n_gpu_layers": n_gpu_layers,
            "n_batch": n_batch,
            "n_ubatch": n_ubatch,
            "n_threads": n_threads,
            "n_threads_batch": n_threads_batch,
            "flash_attn": flash_attn,
            "offload_kqv": offload_kqv,
            "use_mmap": use_mmap,
            "use_mlock": use_mlock,
            "seed": seed,
            "type_k": type_k,
            "type_v": type_v,
            "chat_format": chat_format,
            "lora_path": str(resolved_lora) if resolved_lora else None,
            "lora_scale": lora_scale,
            "verbose": self.verbose if verbose is None else verbose,
        }
        return self.status()

    def chat(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 1024,
        temperature: float = 0.6,
        top_p: float = 0.95,
        top_k: int = 20,
        min_p: float = 0.0,
        typical_p: float = 1.0,
        presence_penalty: float = 0.0,
        frequency_penalty: float = 0.0,
        repeat_penalty: float = 1.0,
        tfs_z: float = 1.0,
        mirostat_mode: int = 0,
        mirostat_tau: float = 5.0,
        mirostat_eta: float = 0.1,
        seed: int | None = None,
        stop: Sequence[str] | None = None,
        enable_thinking: bool = False,
    ) -> Iterator[str]:
        if self.model is None:
            raise RuntimeError("No model is loaded")
        if not isinstance(enable_thinking, bool):
            raise RuntimeError("enable_thinking must be true or false")
        if enable_thinking and not self.thinking_supported:
            raise RuntimeError(
                "This GGUF chat template does not support thinking mode"
            )

        self.thinking_enabled = enable_thinking
        self.last_finish_reason = None
        self.last_usage = None
        chunks = self.model.create_chat_completion(
            messages=list(messages),
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            min_p=min_p,
            typical_p=typical_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            repeat_penalty=repeat_penalty,
            tfs_z=tfs_z,
            mirostat_mode=mirostat_mode,
            mirostat_tau=mirostat_tau,
            mirostat_eta=mirostat_eta,
            seed=None if seed == -1 else seed,
            stop=list(stop or []),
            stream=True,
        )
        for chunk in chunks:
            usage = chunk.get("usage")
            if isinstance(usage, dict):
                self.last_usage = usage
            choices = chunk.get("choices", [])
            if not choices:
                continue
            choice = choices[0]
            finish_reason = choice.get("finish_reason")
            if finish_reason:
                self.last_finish_reason = str(finish_reason)
            token = choice.get("delta", {}).get("content")
            if token:
                yield token

    def unload(self) -> dict[str, Any]:
        was_loaded = self.model is not None
        vram_before_unload = None
        current_gpu = self._nvidia_info()
        if current_gpu is not None:
            vram_before_unload = current_gpu["memory_used_mib"]

        if self.model is not None:
            close = getattr(self.model, "close", None)
            if callable(close):
                close()

        self.model = None
        self.model_path = None
        self.n_ctx = None
        self.n_gpu_layers = None
        self.load_parameters = {}
        self.last_finish_reason = None
        self.last_usage = None
        self.thinking_supported = False
        self.thinking_enabled = False
        self._base_chat_handler = None
        gc.collect()
        time.sleep(0.25)

        gpu_after = self._nvidia_info()
        self.vram_after_unload_mib = (
            gpu_after["memory_used_mib"] if gpu_after is not None else None
        )
        freed = None
        if vram_before_unload is not None and self.vram_after_unload_mib is not None:
            freed = max(0, vram_before_unload - self.vram_after_unload_mib)

        return {
            "loaded": False,
            "was_loaded": was_loaded,
            "vram_freed_mib": freed,
            "vram_after_unload_mib": self.vram_after_unload_mib,
        }

    def status(self) -> dict[str, Any]:
        delta = None
        if self.vram_before_mib is not None and self.vram_loaded_mib is not None:
            delta = self.vram_loaded_mib - self.vram_before_mib

        return {
            "loaded": self.model is not None,
            "backend": "llama.cpp",
            "device": "CUDA" if self.cuda_supported else None,
            "gpu_name": self.gpu_name,
            "gpu_memory_total_mib": self.gpu_memory_total_mib,
            "model_path": str(self.model_path) if self.model_path else None,
            "n_ctx": self.n_ctx,
            "n_gpu_layers": self.n_gpu_layers,
            "load_parameters": dict(self.load_parameters),
            "last_finish_reason": self.last_finish_reason,
            "last_usage": self.last_usage,
            "thinking_supported": self.thinking_supported,
            "thinking_enabled": self.thinking_enabled,
            "vram_before_mib": self.vram_before_mib,
            "vram_loaded_mib": self.vram_loaded_mib,
            "vram_delta_mib": delta,
        }
