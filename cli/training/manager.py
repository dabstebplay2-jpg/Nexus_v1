from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import signal
import subprocess
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from training.dataset import (
    DatasetRecord,
    DatasetValidation,
    discover_jsonl,
    validate_jsonl,
)


MANIFEST_SCHEMA = "minicursor.training/v1"
ACTIVE_STATES = frozenset({"STARTING", "RUNNING", "STOPPING"})
CHECKPOINT_PATTERN = re.compile(r"^checkpoint-(\d+)$", re.IGNORECASE)
ADAPTER_FILENAMES = ("adapter_model.safetensors", "adapter_model.bin")

DEFAULT_TRAINING_OPTIONS: dict[str, Any] = {
    "method": "qlora",
    "load_in_4bit": True,
    "base_model": "unsloth/Qwen3.5-9B",
    "max_seq_length": 512,
    "per_device_train_batch_size": 1,
    "gradient_accumulation_steps": 16,
    "learning_rate": 2e-4,
    "num_train_epochs": 1.0,
    "max_steps": -1,
    "logging_steps": 5,
    "save_steps": 100,
    "lora_r": 16,
    "lora_alpha": 16,
    "lora_dropout": 0.0,
    "seed": 3407,
}


@dataclass(frozen=True)
class AdapterRecord:
    id: str
    name: str
    path: Path
    status: str
    base_model: str | None
    peft_type: str | None
    lora_r: int | None
    lora_alpha: int | None
    checkpoint_steps: tuple[int, ...]
    latest_checkpoint: Path | None
    global_step: int | None
    max_steps: int | None
    final_adapter: bool
    gguf_loras: tuple[Path, ...]
    manifest_path: Path | None
    imported: bool

    @property
    def resumable(self) -> bool:
        return (
            not self.imported
            and self.status != "COMPLETE"
            and self.latest_checkpoint is not None
        )


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _atomic_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(dict(value), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"1", "true", "yes", "on"}
    return bool(value)


class TrainingManager:
    """Manage datasets, adapters and an isolated native QLoRA worker.

    The manager never imports torch, Transformers, Unsloth or bitsandbytes in
    the MiniCursor process. Environment checks and training run in a separate
    ``.venv-train`` or the existing Unsloth Studio Python process instead.
    """

    def __init__(
        self,
        settings: Any | None = None,
        *,
        project_root: str | Path | None = None,
        path: str | Path | None = None,
        training_python: str | Path | None = None,
        home: str | Path | None = None,
        runner: Any = subprocess,
        worker_path: str | Path | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.settings = settings
        self.project_root = Path(
            project_root or Path(__file__).resolve().parents[1]
        ).expanduser().resolve()
        self.home = Path(home or Path.home()).expanduser().resolve()
        selected_python = training_python or path
        if selected_python is None:
            project_python = (
                self.project_root / ".venv-train" / "Scripts" / "python.exe"
            )
            studio_python = (
                self.home
                / ".unsloth"
                / "studio"
                / "unsloth_studio"
                / "Scripts"
                / "python.exe"
            )
            selected_python = (
                project_python if project_python.is_file() else studio_python
            )
        self.training_python = Path(selected_python).expanduser().resolve()
        self.worker_path = Path(
            worker_path or self.project_root / "training" / "worker.py"
        ).expanduser().resolve()
        self.data_root = self.project_root / "training" / "data"
        self.runs_root = self.project_root / "training" / "runs"
        self.unsloth_data_root = (
            self.home / ".unsloth" / "studio" / "assets" / "datasets" / "uploads"
        )
        self.unsloth_outputs_root = self.home / ".unsloth" / "studio" / "outputs"
        self.runner = runner
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._process: Any | None = None
        self._active_state_path: Path | None = None

    # ----------------------------- datasets -----------------------------
    def datasets(self) -> list[DatasetRecord]:
        return discover_jsonl(
            (
                ("project", self.data_root),
                ("Unsloth Studio", self.unsloth_data_root),
            )
        )

    def _resolve_dataset(self, reference: str | Path | DatasetRecord) -> DatasetRecord:
        if isinstance(reference, DatasetRecord):
            return reference

        text = str(reference).strip()
        records = self.datasets()
        normalized_id = text.upper()
        if normalized_id.isdigit():
            normalized_id = f"D{normalized_id}"
        for record in records:
            if normalized_id == record.id:
                return record

        candidate = Path(text).expanduser().resolve()
        if candidate.is_file():
            return DatasetRecord(
                id="CUSTOM",
                name=candidate.stem,
                path=candidate,
                size_bytes=candidate.stat().st_size,
                source="custom",
            )
        available = ", ".join(item.id for item in records) or "none"
        raise ValueError(f"Unknown dataset '{text}'. Available dataset IDs: {available}")

    def validate_dataset(
        self, reference: str | Path | DatasetRecord
    ) -> DatasetValidation:
        try:
            record = self._resolve_dataset(reference)
        except ValueError:
            # Preserve a useful validation result for an explicit missing path.
            text = str(reference).strip()
            if any(separator in text for separator in ("/", "\\")) or text.endswith(
                ".jsonl"
            ):
                return validate_jsonl(text)
            raise
        return validate_jsonl(record.path)

    def format_datasets(self) -> str:
        records = self.datasets()
        if not records:
            return "No training datasets found"

        blocks: list[str] = []
        for record in records:
            result = validate_jsonl(record.path)
            status = "READY" if result.valid else "INVALID"
            blocks.append(
                "\n".join(
                    [
                        f"[{record.id}] {record.name}",
                        f"Source: {record.source}",
                        f"Records: {result.record_count}",
                        f"Size: {record.size_bytes / (1024 ** 2):.2f} MiB",
                        f"Status: {status}",
                        f"Path: {record.path}",
                    ]
                )
            )
        return "Training datasets:\n\n" + "\n\n".join(blocks)

    # ----------------------------- adapters -----------------------------
    @staticmethod
    def _numeric_checkpoints(folder: Path) -> list[tuple[int, Path]]:
        checkpoints: list[tuple[int, Path]] = []
        try:
            children = folder.iterdir()
            for child in children:
                if not child.is_dir():
                    continue
                match = CHECKPOINT_PATTERN.fullmatch(child.name)
                if match:
                    checkpoints.append((int(match.group(1)), child.resolve()))
        except OSError:
            pass
        return sorted(checkpoints, key=lambda item: item[0])

    @staticmethod
    def _is_final_adapter(folder: Path) -> bool:
        return any((folder / filename).is_file() for filename in ADAPTER_FILENAMES)

    @staticmethod
    def _minicursor_manifest(folder: Path) -> Path | None:
        path = folder / "manifest.json"
        value = _read_json(path)
        return path.resolve() if value.get("schema") == MANIFEST_SCHEMA else None

    def _adapter_folders(self) -> list[Path]:
        found: dict[str, Path] = {}
        for root in (self.runs_root, self.unsloth_outputs_root):
            if not root.is_dir():
                continue
            try:
                for config_path in root.rglob("adapter_config.json"):
                    folder = config_path.parent.resolve()
                    if any(CHECKPOINT_PATTERN.fullmatch(part) for part in folder.parts):
                        continue
                    found[str(folder).casefold()] = folder
            except OSError:
                continue

        # An interrupted MiniCursor run can have checkpoints but no final adapter.
        if self.runs_root.is_dir():
            try:
                for manifest in self.runs_root.glob("*/manifest.json"):
                    value = _read_json(manifest)
                    if value.get("schema") == MANIFEST_SCHEMA:
                        folder = manifest.parent.resolve()
                        found[str(folder).casefold()] = folder
            except OSError:
                pass

        return sorted(
            found.values(), key=lambda item: (item.name.casefold(), str(item).casefold())
        )

    def adapters(self) -> list[AdapterRecord]:
        records: list[AdapterRecord] = []
        for index, folder in enumerate(self._adapter_folders(), 1):
            checkpoints = self._numeric_checkpoints(folder)
            latest_checkpoint = checkpoints[-1][1] if checkpoints else None
            final_adapter = self._is_final_adapter(folder)

            config_path = folder / "adapter_config.json"
            if not config_path.is_file() and latest_checkpoint is not None:
                config_path = latest_checkpoint / "adapter_config.json"
            config = _read_json(config_path)

            state_path: Path | None = None
            if latest_checkpoint is not None:
                candidate = latest_checkpoint / "trainer_state.json"
                if candidate.is_file():
                    state_path = candidate
            if state_path is None and (folder / "trainer_state.json").is_file():
                state_path = folder / "trainer_state.json"
            trainer_state = _read_json(state_path) if state_path else {}
            global_step = _as_int(trainer_state.get("global_step"))
            max_steps = _as_int(trainer_state.get("max_steps"))

            manifest_path = self._minicursor_manifest(folder)
            gguf_loras = tuple(
                sorted(
                    (
                        path.resolve()
                        for path in folder.glob("*-lora-*.gguf")
                        if path.is_file()
                    ),
                    key=lambda path: path.name.casefold(),
                )
            )
            run_state = _read_json(folder / "state.json") if manifest_path else {}
            complete = bool(
                final_adapter
                and global_step is not None
                and max_steps is not None
                and max_steps > 0
                and global_step >= max_steps
            )
            if complete:
                status = "COMPLETE"
            else:
                stored_status = str(run_state.get("status", "")).upper()
                if stored_status in ACTIVE_STATES | {
                    "FAILED",
                    "INTERRUPTED",
                    "CANCELLED",
                }:
                    status = stored_status
                elif final_adapter:
                    status = "READY"
                elif checkpoints:
                    status = "INCOMPLETE"
                else:
                    status = "CONFIGURED"

            manifest = _read_json(manifest_path) if manifest_path else {}
            records.append(
                AdapterRecord(
                    id=f"A{index}",
                    name=folder.name,
                    path=folder,
                    status=status,
                    base_model=(
                        str(config.get("base_model_name_or_path"))
                        if config.get("base_model_name_or_path")
                        else str(manifest.get("base_model"))
                        if manifest.get("base_model")
                        else None
                    ),
                    peft_type=(
                        str(config.get("peft_type")) if config.get("peft_type") else None
                    ),
                    lora_r=_as_int(config.get("r")),
                    lora_alpha=_as_int(config.get("lora_alpha")),
                    checkpoint_steps=tuple(step for step, _path in checkpoints),
                    latest_checkpoint=latest_checkpoint,
                    global_step=global_step,
                    max_steps=max_steps,
                    final_adapter=final_adapter,
                    gguf_loras=gguf_loras,
                    manifest_path=manifest_path,
                    imported=manifest_path is None,
                )
            )
        return records

    def _resolve_adapter(self, reference: str | Path | AdapterRecord) -> AdapterRecord:
        if isinstance(reference, AdapterRecord):
            return reference
        text = str(reference).strip()
        normalized_id = text.upper()
        if normalized_id.isdigit():
            normalized_id = f"A{normalized_id}"
        records = self.adapters()
        for record in records:
            if record.id == normalized_id:
                return record
        candidate = Path(text).expanduser().resolve()
        for record in records:
            if record.path == candidate:
                return record
        available = ", ".join(item.id for item in records) or "none"
        raise ValueError(f"Unknown adapter '{text}'. Available adapter IDs: {available}")

    def format_adapters(self) -> str:
        records = self.adapters()
        if not records:
            return "No LoRA adapters found"

        blocks: list[str] = []
        for record in records:
            progress = (
                f"{record.global_step}/{record.max_steps}"
                if record.global_step is not None and record.max_steps is not None
                else "unavailable"
            )
            resume = (
                "available"
                if record.resumable
                else "blocked (imported)"
                if record.imported
                else "not needed"
                if record.status == "COMPLETE"
                else "unavailable"
            )
            blocks.append(
                "\n".join(
                    [
                        f"[{record.id}] {record.name}",
                        f"Status: {record.status}",
                        f"Base model: {record.base_model or 'unknown'}",
                        f"LoRA: r={record.lora_r or 'unknown'}, "
                        f"alpha={record.lora_alpha or 'unknown'}",
                        f"Progress: {progress}",
                        f"Checkpoints: {len(record.checkpoint_steps)}",
                        f"Resume: {resume}",
                        "GGUF LoRA: "
                        + (
                            ", ".join(str(path) for path in record.gguf_loras)
                            if record.gguf_loras
                            else "not exported"
                        ),
                        f"Path: {record.path}",
                    ]
                )
            )
        return "LoRA adapters:\n\n" + "\n\n".join(blocks)

    def export_adapter(
        self,
        adapter_ref: str | Path | AdapterRecord,
        *,
        outtype: str = "f16",
    ) -> dict[str, Any]:
        """Convert a completed PEFT adapter to llama.cpp's GGUF LoRA format."""

        self._assert_idle()
        adapter = self._resolve_adapter(adapter_ref)
        if not adapter.final_adapter:
            raise RuntimeError("Only a final PEFT adapter can be exported")
        if not adapter.base_model:
            raise RuntimeError("Adapter base model is unknown; export is unsafe")

        normalized_outtype = outtype.strip().casefold()
        if normalized_outtype not in {"f32", "f16", "bf16", "q8_0", "auto"}:
            raise ValueError("LoRA GGUF outtype must be f32, f16, bf16, q8_0, or auto")

        converter = (
            self.home / ".unsloth" / "llama.cpp" / "convert_lora_to_gguf.py"
        )
        if not converter.is_file():
            raise RuntimeError(
                "llama.cpp LoRA converter was not found. Open Unsloth Studio once "
                "or install a full llama.cpp source checkout under ~/.unsloth/llama.cpp"
            )

        base_path = Path(adapter.base_model).expanduser()
        if base_path.is_dir():
            resolved_base = base_path.resolve()
        else:
            cached = self._cached_model_snapshot(adapter.base_model)
            if cached is None:
                raise RuntimeError(
                    "The adapter's Transformers base is not cached locally; "
                    "automatic downloads during export are disabled"
                )
            resolved_base = cached

        output_path = adapter.path / f"{adapter.name}-lora-{normalized_outtype}.gguf"
        log_path = adapter.path / "export-gguf.log"
        if output_path.is_file() and output_path.stat().st_size > 1024:
            return {
                "adapter_id": adapter.id,
                "path": str(output_path.resolve()),
                "size_bytes": output_path.stat().st_size,
                "log": str(log_path.resolve()),
                "cached": True,
            }

        argv = [
            str(self.training_python),
            str(converter.resolve()),
            str(adapter.path),
            "--outfile",
            str(output_path),
            "--outtype",
            normalized_outtype,
            "--base",
            str(resolved_base),
        ]
        try:
            with log_path.open("w", encoding="utf-8", errors="replace") as stream:
                completed = self._run_command(
                    argv,
                    shell=False,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=1800,
                )
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            raise RuntimeError(f"LoRA GGUF export failed: {exc}") from exc
        if getattr(completed, "returncode", 1) != 0:
            raise RuntimeError(
                f"LoRA GGUF export failed with exit code {completed.returncode}; "
                f"see {log_path}"
            )
        if not output_path.is_file() or output_path.stat().st_size <= 1024:
            raise RuntimeError(
                f"Converter finished without a valid GGUF output; see {log_path}"
            )
        return {
            "adapter_id": adapter.id,
            "path": str(output_path.resolve()),
            "size_bytes": output_path.stat().st_size,
            "log": str(log_path.resolve()),
            "cached": False,
        }

    # ----------------------------- settings -----------------------------
    def _setting(self, key: str, default: Any = None) -> Any:
        if self.settings is None:
            return default
        getter = getattr(self.settings, "get", None)
        if callable(getter):
            # Validated settings managers use dotted names, while lightweight
            # injected dictionaries often expose bare worker option names.
            for candidate in (f"train.{key}", f"training.{key}", key):
                try:
                    value = getter(candidate, None)
                except TypeError:
                    try:
                        value = getter(candidate)
                    except (KeyError, TypeError, ValueError):
                        continue
                except (KeyError, ValueError):
                    continue
                if value is not None:
                    return value
        if isinstance(self.settings, Mapping):
            return self.settings.get(key, default)
        return default

    def _training_options(self) -> dict[str, Any]:
        options = dict(DEFAULT_TRAINING_OPTIONS)
        if self.settings is not None:
            provider = getattr(self.settings, "train_options", None)
            try:
                supplied = provider() if callable(provider) else provider
            except (KeyError, TypeError):
                supplied = None
            if isinstance(supplied, Mapping):
                options.update(supplied)
            elif isinstance(self.settings, Mapping):
                nested = self.settings.get("training") or self.settings.get("train")
                if isinstance(nested, Mapping):
                    options.update(nested)
        for key in tuple(options):
            configured = self._setting(key)
            if configured is not None:
                options[key] = configured
        return options

    def _cached_model_snapshot(self, model_id: str) -> Path | None:
        """Resolve a Hugging Face model ID to a complete local snapshot."""

        if "/" not in model_id or Path(model_id).exists():
            return None
        cache_name = "models--" + model_id.replace("/", "--")
        snapshots = self.home / ".cache" / "huggingface" / "hub" / cache_name / "snapshots"
        if not snapshots.is_dir():
            return None
        candidates = [
            path.resolve()
            for path in snapshots.iterdir()
            if path.is_dir() and (path / "config.json").is_file()
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda path: path.stat().st_mtime_ns)

    # ------------------------------- doctor -----------------------------
    def _run_command(self, argv: Sequence[str], **kwargs: Any) -> Any:
        method = getattr(self.runner, "run", None)
        if callable(method):
            return method(list(argv), **kwargs)
        raise RuntimeError("The injected process runner does not provide run()")

    def _popen(self, argv: Sequence[str], **kwargs: Any) -> Any:
        method = getattr(self.runner, "Popen", None)
        if callable(method):
            return method(list(argv), **kwargs)
        if callable(self.runner):
            return self.runner(list(argv), **kwargs)
        raise RuntimeError("The injected process runner does not provide Popen()")

    def doctor(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "available": False,
            "python": str(self.training_python),
            "worker": str(self.worker_path),
            "cuda_available": False,
            "gpu_name": None,
            "gpu_free_mib": None,
            "gpu_total_mib": None,
            "packages": {},
            "error": None,
        }
        if not self.training_python.is_file():
            result["error"] = "Unsloth Studio training Python was not found"
            return result

        script = (
            "import importlib.metadata as m,json,sys; "
            "import torch; "
            "names=['unsloth','transformers','peft','trl','bitsandbytes','datasets']; "
            "free,total=torch.cuda.mem_get_info(0) if torch.cuda.is_available() else (0,0); "
            "d={'python_version':sys.version.split()[0],"
            "'torch_version':torch.__version__,"
            "'cuda_available':torch.cuda.is_available(),"
            "'gpu_name':torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,"
            "'gpu_free_mib':round(free/1048576) if free else None,"
            "'gpu_total_mib':round(total/1048576) if total else None,"
            "'bf16_supported':torch.cuda.is_bf16_supported() if torch.cuda.is_available() else False,"
            "'packages':{n:m.version(n) for n in names}}; "
            "print('__MINICURSOR_DOCTOR__'+json.dumps(d))"
        )
        try:
            completed = self._run_command(
                [str(self.training_python), "-c", script],
                shell=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
            result["error"] = str(exc)
            return result

        stdout = str(getattr(completed, "stdout", "") or "")
        marker = "__MINICURSOR_DOCTOR__"
        payload_line = next(
            (line for line in reversed(stdout.splitlines()) if line.startswith(marker)),
            None,
        )
        if getattr(completed, "returncode", 1) != 0 or payload_line is None:
            stderr = str(getattr(completed, "stderr", "") or "").strip()
            result["error"] = stderr or "Training environment check failed"
            return result
        try:
            payload = json.loads(payload_line[len(marker) :])
        except json.JSONDecodeError as exc:
            result["error"] = f"Invalid doctor response: {exc}"
            return result

        result.update(payload)
        result["available"] = bool(payload.get("cuda_available"))
        if not result["available"]:
            result["error"] = "CUDA is not available in the training environment"
        return result

    def format_doctor(self) -> str:
        info = self.doctor()
        packages = info.get("packages") or {}
        lines = [
            f"Training environment: {'READY' if info.get('available') else 'NOT READY'}",
            f"Python: {info.get('python')}",
            f"Python version: {info.get('python_version', 'unknown')}",
            f"PyTorch: {info.get('torch_version', 'unknown')}",
            f"CUDA: {'available' if info.get('cuda_available') else 'unavailable'}",
            f"GPU: {info.get('gpu_name') or 'unavailable'}",
            f"VRAM free / total: {info.get('gpu_free_mib', 'unknown')} / "
            f"{info.get('gpu_total_mib', 'unknown')} MiB",
            f"BF16: {'supported' if info.get('bf16_supported') else 'unavailable'}",
        ]
        if packages:
            lines.append(
                "Packages: "
                + ", ".join(f"{name}={version}" for name, version in packages.items())
            )
        if info.get("error"):
            lines.append(f"Error: {info['error']}")
        return "\n".join(lines)

    def _check_launch_resources(self, environment: Mapping[str, Any]) -> None:
        free_vram = _as_int(environment.get("gpu_free_mib"))
        if free_vram is not None and free_vram < 8_000:
            raise RuntimeError(
                f"Only {free_vram} MiB GPU VRAM is free; at least 8000 MiB is "
                "required for the experimental 9B QLoRA profile"
            )
        disk_target = self.runs_root.parent
        disk_target.mkdir(parents=True, exist_ok=True)
        free_disk = shutil.disk_usage(disk_target).free
        if free_disk < 5 * 1024**3:
            raise RuntimeError(
                "Less than 5 GiB of free disk space is available for checkpoints"
            )

    # -------------------------- plan and lifecycle -----------------------
    def plan(
        self,
        dataset_ref: str | Path | DatasetRecord | None = None,
        resume_ref: str | Path | AdapterRecord | None = None,
    ) -> dict[str, Any]:
        """Build a training plan without writing, unloading or starting work."""

        errors: list[str] = []
        warnings: list[str] = []
        options = self._training_options()
        method = str(options.pop("method", "qlora")).casefold()
        load_in_4bit = _as_bool(options.pop("load_in_4bit", True))
        base_model = str(options.pop("base_model", "")).strip()
        configured_dataset = options.pop("dataset", None) or self._setting("dataset")
        resume_checkpoint: Path | None = None
        manifest_path: Path | None = None
        adapter: AdapterRecord | None = None
        expected_dataset_sha256: str | None = None

        if resume_ref is not None:
            try:
                adapter = self._resolve_adapter(resume_ref)
            except ValueError as exc:
                errors.append(str(exc))
            else:
                if adapter.imported or adapter.manifest_path is None:
                    errors.append(
                        "Imported adapters cannot be resumed because they do not have "
                        "a MiniCursor manifest"
                    )
                elif adapter.status == "COMPLETE":
                    errors.append("This training run is already complete")
                elif adapter.latest_checkpoint is None:
                    errors.append("No numeric checkpoint is available to resume")
                else:
                    resume_checkpoint = adapter.latest_checkpoint
                    manifest_path = adapter.manifest_path
                    previous = _read_json(manifest_path)
                    dataset_ref = previous.get("dataset")
                    expected_dataset_sha256 = (
                        str(previous.get("dataset_sha256"))
                        if previous.get("dataset_sha256")
                        else None
                    )
                    base_model = str(previous.get("base_model") or base_model)
                    load_in_4bit = _as_bool(
                        previous.get("load_in_4bit", load_in_4bit)
                    )
                    method = str(previous.get("method") or method).casefold()
                    previous_training = previous.get("training")
                    if isinstance(previous_training, Mapping):
                        options = dict(previous_training)
        elif dataset_ref is None:
            dataset_ref = configured_dataset

        if method != "qlora":
            errors.append("Only QLoRA training is supported on this hardware")
        if not load_in_4bit:
            errors.append("QLoRA requires load_in_4bit=true")
        if not base_model:
            errors.append("A Transformers base_model must be configured")
        elif base_model.casefold().endswith(".gguf"):
            errors.append(
                "GGUF files cannot be trained directly; configure the original "
                "Transformers base model or repository"
            )
        else:
            cached_snapshot = self._cached_model_snapshot(base_model)
            if cached_snapshot is not None:
                base_model = str(cached_snapshot)

        dataset_record: DatasetRecord | None = None
        validation: DatasetValidation | None = None
        dataset_sha256: str | None = None
        if dataset_ref is None or not str(dataset_ref).strip():
            errors.append(
                "No dataset selected. Use a D-number from 'train datasets' or a JSONL path"
            )
        else:
            try:
                dataset_record = self._resolve_dataset(dataset_ref)
                validation = validate_jsonl(dataset_record.path)
            except ValueError as exc:
                errors.append(str(exc))
            else:
                if not validation.valid:
                    errors.extend(f"Dataset: {message}" for message in validation.errors)
                else:
                    dataset_sha256 = _file_sha256(dataset_record.path)
                    if resume_ref is not None and expected_dataset_sha256 is None:
                        errors.append(
                            "Resume manifest has no dataset fingerprint; refusing "
                            "unsafe continuation"
                        )
                    elif (
                        expected_dataset_sha256 is not None
                        and dataset_sha256 != expected_dataset_sha256
                    ):
                        errors.append(
                            "Dataset changed since the run started; resume is blocked"
                        )

        if not self.training_python.is_file():
            errors.append(
                f"Training Python was not found: {self.training_python}"
            )
        if not self.worker_path.is_file():
            errors.append(f"Training worker was not found: {self.worker_path}")

        if options.get("max_seq_length"):
            try:
                long_context = int(options["max_seq_length"]) > 2048
            except (TypeError, ValueError):
                errors.append("max_seq_length must be an integer")
            else:
                if long_context:
                    warnings.append(
                        "Sequences above 2048 tokens can exceed 12 GiB VRAM; "
                        "start conservatively"
                    )

        return {
            "ready": not errors,
            "mode": "resume" if resume_ref is not None else "new",
            "method": method,
            "load_in_4bit": load_in_4bit,
            "base_model": base_model,
            "dataset": validation.as_dict() if validation else None,
            "dataset_id": dataset_record.id if dataset_record else None,
            "dataset_sha256": dataset_sha256,
            "training": options,
            "training_python": str(self.training_python),
            "worker": str(self.worker_path),
            "resume_from_checkpoint": (
                str(resume_checkpoint) if resume_checkpoint else None
            ),
            "manifest": str(manifest_path) if manifest_path else None,
            "adapter": str(adapter.path) if adapter else None,
            "errors": errors,
            "warnings": warnings,
        }

    def _latest_state_path(self) -> Path | None:
        if self._active_state_path and self._active_state_path.is_file():
            return self._active_state_path
        if not self.runs_root.is_dir():
            return None
        candidates = list(self.runs_root.glob("*/state.json"))
        if not candidates:
            return None
        return max(candidates, key=lambda item: item.stat().st_mtime_ns)

    @staticmethod
    def _pid_running(pid: int | None) -> bool:
        if not pid or pid <= 0:
            return False
        try:
            os.kill(pid, 0)
        except (OSError, ValueError):
            return False
        return True

    def status(self) -> dict[str, Any]:
        state_path = self._latest_state_path()
        if state_path is None:
            return {"status": "IDLE", "running": False}
        state = _read_json(state_path)
        state.setdefault("status", "UNKNOWN")
        state["state_path"] = str(state_path)

        if self._process is not None and state_path == self._active_state_path:
            return_code = self._process.poll()
            if return_code is None:
                state["running"] = True
                return state
            if str(state.get("status", "")).upper() in ACTIVE_STATES:
                state["status"] = "COMPLETED" if return_code == 0 else "INTERRUPTED"
                state["running"] = False
                state["return_code"] = return_code
                state["finished_at"] = self._now().isoformat()
                _atomic_json(state_path, {k: v for k, v in state.items() if k != "state_path"})
            self._process = None

        status_name = str(state.get("status", "UNKNOWN")).upper()
        pid = _as_int(state.get("pid"))
        state["running"] = status_name in ACTIVE_STATES and self._pid_running(pid)
        return state

    def format_status(self) -> str:
        state = self.status()
        if state.get("status") == "IDLE":
            return "Training status: IDLE"
        lines = [
            f"Training status: {state.get('status')}",
            f"Run: {state.get('run_id', 'unknown')}",
            f"PID: {state.get('pid', 'unavailable')}",
            f"Started: {state.get('started_at', 'unknown')}",
            f"Log: {state.get('log', 'unavailable')}",
        ]
        if state.get("return_code") is not None:
            lines.append(f"Exit code: {state['return_code']}")
        return "\n".join(lines)

    def _assert_idle(self) -> None:
        state = self.status()
        if state.get("running"):
            raise RuntimeError(
                f"Training run {state.get('run_id', '')} is already active"
            )

    def _next_run_dir(self) -> tuple[str, Path]:
        timestamp = self._now().strftime("%Y%m%d-%H%M%S")
        base_id = f"qlora-{timestamp}"
        run_id = base_id
        suffix = 2
        while (self.runs_root / run_id).exists():
            run_id = f"{base_id}-{suffix}"
            suffix += 1
        return run_id, self.runs_root / run_id

    def _spawn(
        self,
        *,
        run_id: str,
        run_dir: Path,
        manifest_path: Path,
        state_path: Path,
        log_path: Path,
        append_log: bool,
    ) -> dict[str, Any]:
        initial_state: dict[str, Any] = {
            "run_id": run_id,
            "status": "STARTING",
            "pid": None,
            "started_at": self._now().isoformat(),
            "finished_at": None,
            "return_code": None,
            "manifest": str(manifest_path),
            "log": str(log_path),
        }
        _atomic_json(state_path, initial_state)
        argv = [
            str(self.training_python),
            str(self.worker_path),
            "--manifest",
            str(manifest_path),
        ]
        kwargs: dict[str, Any] = {
            "cwd": str(self.project_root),
            "stdin": subprocess.DEVNULL,
            "stderr": subprocess.STDOUT,
            "shell": False,
        }
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True

        try:
            with log_path.open("ab" if append_log else "wb") as log_stream:
                kwargs["stdout"] = log_stream
                process = self._popen(argv, **kwargs)
        except Exception as exc:
            failed = {
                **initial_state,
                "status": "FAILED",
                "finished_at": self._now().isoformat(),
                "error": str(exc),
            }
            _atomic_json(state_path, failed)
            raise RuntimeError(f"Could not start training worker: {exc}") from exc

        self._process = process
        self._active_state_path = state_path
        running = {**initial_state, "status": "RUNNING", "pid": process.pid}
        current = _read_json(state_path)
        if str(current.get("status", "STARTING")).upper() == "STARTING":
            _atomic_json(state_path, running)
        else:
            running = current
        return {**running, "argv": argv, "run_dir": str(run_dir)}

    def start(
        self,
        dataset_ref: str | Path | DatasetRecord | None = None,
        confirmed: bool = False,
        unload_callback: Callable[[], Any] | None = None,
    ) -> dict[str, Any]:
        self._assert_idle()
        plan = self.plan(dataset_ref=dataset_ref)
        if not confirmed:
            raise RuntimeError(
                "Training was not started. Confirm the QLoRA run explicitly first"
            )
        if not plan["ready"]:
            raise RuntimeError("Training plan is not ready: " + "; ".join(plan["errors"]))

        # Free llama.cpp VRAM before creating run state or launching torch.
        if unload_callback is not None:
            unload_callback()

        environment = self.doctor()
        if not environment.get("available"):
            raise RuntimeError(
                "Training environment is not ready: "
                + str(environment.get("error") or "CUDA check failed")
            )
        self._check_launch_resources(environment)

        run_id, run_dir = self._next_run_dir()
        run_dir.mkdir(parents=True, exist_ok=False)
        manifest_path = run_dir / "manifest.json"
        state_path = run_dir / "state.json"
        log_path = run_dir / "train.log"
        manifest: dict[str, Any] = {
            "schema": MANIFEST_SCHEMA,
            "run_id": run_id,
            "created_at": self._now().isoformat(),
            "method": "qlora",
            "load_in_4bit": True,
            "base_model": plan["base_model"],
            "dataset": plan["dataset"]["path"],
            "dataset_sha256": plan["dataset_sha256"],
            "output_dir": str(run_dir),
            "state_path": str(state_path),
            "resume_from_checkpoint": None,
            "training": plan["training"],
        }
        _atomic_json(manifest_path, manifest)
        return self._spawn(
            run_id=run_id,
            run_dir=run_dir,
            manifest_path=manifest_path,
            state_path=state_path,
            log_path=log_path,
            append_log=False,
        )

    def resume(
        self,
        adapter_ref: str | Path | AdapterRecord,
        confirmed: bool = False,
        unload_callback: Callable[[], Any] | None = None,
    ) -> dict[str, Any]:
        self._assert_idle()
        plan = self.plan(resume_ref=adapter_ref)
        if not confirmed:
            raise RuntimeError(
                "Training was not resumed. Confirm the QLoRA run explicitly first"
            )
        if not plan["ready"]:
            raise RuntimeError("Resume plan is not ready: " + "; ".join(plan["errors"]))

        manifest_path = Path(plan["manifest"]).resolve()
        run_dir = manifest_path.parent
        state_path = run_dir / "state.json"
        log_path = run_dir / "train.log"
        manifest = _read_json(manifest_path)

        if unload_callback is not None:
            unload_callback()

        environment = self.doctor()
        if not environment.get("available"):
            raise RuntimeError(
                "Training environment is not ready: "
                + str(environment.get("error") or "CUDA check failed")
            )
        self._check_launch_resources(environment)

        manifest["resume_from_checkpoint"] = plan["resume_from_checkpoint"]
        manifest["state_path"] = str(state_path)
        manifest["output_dir"] = str(run_dir)
        _atomic_json(manifest_path, manifest)
        run_id = str(manifest.get("run_id") or run_dir.name)
        return self._spawn(
            run_id=run_id,
            run_dir=run_dir,
            manifest_path=manifest_path,
            state_path=state_path,
            log_path=log_path,
            append_log=True,
        )

    def logs(self, lines: int = 60, run_ref: str | Path | None = None) -> str:
        if lines < 1:
            raise ValueError("lines must be at least 1")
        if run_ref is None:
            state_path = self._latest_state_path()
            if state_path is None:
                return "No training log is available"
            state = _read_json(state_path)
            log_path = Path(str(state.get("log") or state_path.parent / "train.log"))
        else:
            candidate = Path(str(run_ref)).expanduser()
            if not candidate.is_absolute():
                candidate = self.runs_root / candidate
            candidate = candidate.resolve()
            log_path = candidate if candidate.is_file() else candidate / "train.log"
        if not log_path.is_file():
            return f"Training log not found: {log_path}"
        with log_path.open("r", encoding="utf-8", errors="replace") as stream:
            return "".join(deque(stream, maxlen=lines)).rstrip()

    def stop(self) -> dict[str, Any]:
        state = self.status()
        if not state.get("running"):
            raise RuntimeError("No training run is active")
        pid = _as_int(state.get("pid"))
        try:
            if self._process is not None and self._process.poll() is None:
                if os.name == "nt":
                    self._process.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    self._process.send_signal(signal.SIGINT)
            elif pid is not None:
                if os.name == "nt":
                    os.kill(pid, signal.CTRL_BREAK_EVENT)
                else:
                    os.kill(pid, signal.SIGINT)
            else:
                raise RuntimeError("The active worker PID is unavailable")
        except OSError as exc:
            raise RuntimeError(f"Could not request a graceful stop: {exc}") from exc

        state_path = Path(str(state["state_path"]))
        stored = _read_json(state_path)
        stored["status"] = "STOPPING"
        stored["stop_requested_at"] = self._now().isoformat()
        _atomic_json(state_path, stored)
        return {**stored, "running": True, "state_path": str(state_path)}
