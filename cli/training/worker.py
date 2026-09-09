"""Isolated QLoRA training worker for MiniCursor.

This module intentionally imports only the Python standard library at import
time.  MiniCursor's inference environment can therefore inspect and test the
manifest helpers without importing PyTorch, Transformers, TRL, or Unsloth.

The actual training runtime is loaded lazily by :func:`run_training`.  The
worker is meant to be launched with the Python executable from the dedicated
Unsloth environment::

    python training/worker.py --manifest training/runs/<job>/manifest.json
"""

from __future__ import annotations

import argparse
import inspect
import json
import math
import os
import re
import signal
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


TARGET_MODULES = (
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
)

_CHECKPOINT_RE = re.compile(r"^checkpoint-(\d+)$", re.IGNORECASE)
_ALLOWED_ROLES = frozenset({"system", "developer", "user", "assistant"})


class ManifestError(ValueError):
    """Raised when a training manifest is invalid or unsafe."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _json_safe(value: Any) -> Any:
    """Convert common metric values into values accepted by json.dumps."""

    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "item"):
        try:
            return _json_safe(value.item())
        except (TypeError, ValueError, RuntimeError):
            pass
    return str(value)


class AtomicState:
    """Small atomic JSON state store shared with the parent CLI process."""

    def __init__(self, path: Path, initial: Mapping[str, Any] | None = None) -> None:
        self.path = path
        existing: dict[str, Any] = {}
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                existing = loaded
        except (FileNotFoundError, OSError, UnicodeDecodeError, json.JSONDecodeError):
            pass
        existing.update(initial or {})
        self.data = existing

    def update(self, **changes: Any) -> None:
        self.data.update(_json_safe(changes))
        self.data["updated_at"] = _utc_now()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(
            f".{self.path.name}.{os.getpid()}.{time.time_ns()}.tmp"
        )
        try:
            with temporary.open("w", encoding="utf-8", newline="\n") as handle:
                json.dump(
                    self.data,
                    handle,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def load_manifest(path: str | os.PathLike[str]) -> dict[str, Any]:
    manifest_path = Path(path).expanduser().resolve()
    try:
        with manifest_path.open("r", encoding="utf-8-sig") as handle:
            value = json.load(handle)
    except FileNotFoundError as exc:
        raise ManifestError(f"Manifest not found: {manifest_path}") from exc
    except json.JSONDecodeError as exc:
        raise ManifestError(
            f"Invalid manifest JSON at line {exc.lineno}, column {exc.colno}: "
            f"{exc.msg}"
        ) from exc
    if not isinstance(value, dict):
        raise ManifestError("Manifest root must be a JSON object")
    value["_manifest_path"] = str(manifest_path)
    return value


def _first_value(manifest: Mapping[str, Any], *names: str) -> Any:
    training = manifest.get("training")
    for name in names:
        if name in manifest:
            return manifest[name]
        if isinstance(training, Mapping) and name in training:
            return training[name]
    return None


def _required_text(manifest: Mapping[str, Any], *names: str) -> str:
    value = _first_value(manifest, *names)
    if not isinstance(value, str) or not value.strip():
        raise ManifestError(f"Missing non-empty setting: {names[0]}")
    return value.strip()


def _bool_setting(
    manifest: Mapping[str, Any], name: str, *, default: bool | None = None
) -> bool:
    value = _first_value(manifest, name)
    if value is None:
        if default is None:
            raise ManifestError(f"Missing boolean setting: {name}")
        return default
    if not isinstance(value, bool):
        raise ManifestError(f"{name} must be true or false")
    return value


def _int_setting(
    manifest: Mapping[str, Any],
    *names: str,
    default: int,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    value = _first_value(manifest, *names)
    if value is None:
        value = default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ManifestError(f"{names[0]} must be an integer")
    if minimum is not None and value < minimum:
        raise ManifestError(f"{names[0]} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise ManifestError(f"{names[0]} must be at most {maximum}")
    return value


def _optional_int_setting(
    manifest: Mapping[str, Any],
    *names: str,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int | None:
    value = _first_value(manifest, *names)
    if value is None:
        return None
    return _int_setting(
        manifest,
        *names,
        default=0,
        minimum=minimum,
        maximum=maximum,
    )


def _float_setting(
    manifest: Mapping[str, Any],
    *names: str,
    default: float,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    value = _first_value(manifest, *names)
    if value is None:
        value = default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ManifestError(f"{names[0]} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ManifestError(f"{names[0]} must be finite")
    if minimum is not None and result < minimum:
        raise ManifestError(f"{names[0]} must be at least {minimum}")
    if maximum is not None and result > maximum:
        raise ManifestError(f"{names[0]} must be at most {maximum}")
    return result


def validate_messages_jsonl(path: str | os.PathLike[str]) -> int:
    """Validate a text-only conversational JSONL dataset.

    Returns the number of non-empty samples.  Validation happens before the
    GPU model is loaded so an accidental malformed dataset does not consume
    VRAM first.
    """

    dataset_path = Path(path).expanduser().resolve()
    if not dataset_path.is_file():
        raise ManifestError(f"Dataset not found: {dataset_path}")
    if dataset_path.suffix.lower() not in {".jsonl", ".json"}:
        raise ManifestError("Dataset must be a .jsonl or line-delimited .json file")

    count = 0
    try:
        handle = dataset_path.open("r", encoding="utf-8-sig")
    except OSError as exc:
        raise ManifestError(f"Cannot open dataset: {exc}") from exc

    with handle:
        for line_number, raw_line in enumerate(handle, start=1):
            if not raw_line.strip():
                continue
            count += 1
            try:
                sample = json.loads(raw_line)
            except json.JSONDecodeError as exc:
                raise ManifestError(
                    f"Dataset line {line_number} is invalid JSON: {exc.msg}"
                ) from exc
            if not isinstance(sample, dict):
                raise ManifestError(
                    f"Dataset line {line_number} must contain a JSON object"
                )
            messages = sample.get("messages")
            if not isinstance(messages, list) or not messages:
                raise ManifestError(
                    f"Dataset line {line_number}: messages must be a non-empty list"
                )

            seen_user = False
            seen_assistant = False
            for index, message in enumerate(messages, start=1):
                label = f"Dataset line {line_number}, message {index}"
                if not isinstance(message, dict):
                    raise ManifestError(f"{label} must be an object")
                role = message.get("role")
                content = message.get("content")
                if role not in _ALLOWED_ROLES:
                    allowed = ", ".join(sorted(_ALLOWED_ROLES))
                    raise ManifestError(f"{label}: role must be one of {allowed}")
                if not isinstance(content, str) or not content.strip():
                    raise ManifestError(f"{label}: content must be non-empty text")
                seen_user = seen_user or role == "user"
                seen_assistant = seen_assistant or role == "assistant"

            if not seen_user or not seen_assistant:
                raise ManifestError(
                    f"Dataset line {line_number} must include user and assistant messages"
                )

    if count == 0:
        raise ManifestError("Dataset contains no samples")
    return count


def _looks_like_local_path(value: str) -> bool:
    path = Path(value).expanduser()
    return (
        path.is_absolute()
        or value.startswith((".", "~"))
        or "\\" in value
        or bool(re.match(r"^[A-Za-z]:", value))
    )


def validate_base_model(value: str) -> str:
    if value.lower().endswith(".gguf"):
        raise ManifestError(
            "A GGUF file cannot be trained directly. Select the Transformers "
            "base model directory or Hugging Face repository instead."
        )

    expanded = Path(value).expanduser()
    if expanded.exists():
        resolved = expanded.resolve()
        if not resolved.is_dir():
            raise ManifestError(f"Base model must be a directory: {resolved}")
        if not (resolved / "config.json").is_file():
            raise ManifestError(
                f"Transformers config.json not found in base model: {resolved}"
            )
        return str(resolved)

    if _looks_like_local_path(value):
        raise ManifestError(f"Base model directory not found: {expanded}")
    if value.count("/") != 1 or any(part.strip() == "" for part in value.split("/")):
        raise ManifestError(
            "Remote base model must be a Hugging Face repository such as owner/model"
        )
    return value


def validate_resume_checkpoint(
    checkpoint: str | os.PathLike[str] | None, output_dir: Path
) -> str | None:
    """Allow resume only from a real, incomplete checkpoint in this run."""

    if checkpoint in (None, ""):
        return None
    if not isinstance(checkpoint, (str, os.PathLike)):
        raise ManifestError("resume_from_checkpoint must be a path")

    resolved_output = output_dir.resolve()
    resolved = Path(checkpoint).expanduser().resolve()
    try:
        resolved.relative_to(resolved_output)
    except ValueError as exc:
        raise ManifestError(
            "Resume checkpoint must be located inside this job's output directory"
        ) from exc
    match = _CHECKPOINT_RE.fullmatch(resolved.name)
    if not resolved.is_dir() or match is None:
        raise ManifestError("Resume path must be an existing checkpoint-<step> directory")

    trainer_state_path = resolved / "trainer_state.json"
    if not trainer_state_path.is_file():
        raise ManifestError(f"Checkpoint is missing trainer_state.json: {resolved}")
    try:
        state = json.loads(trainer_state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"Cannot read checkpoint trainer_state.json: {exc}") from exc

    step = state.get("global_step", int(match.group(1)))
    maximum = state.get("max_steps")
    if (
        isinstance(step, (int, float))
        and isinstance(maximum, (int, float))
        and maximum > 0
        and step >= maximum
    ):
        raise ManifestError(
            f"Checkpoint is already complete ({int(step)}/{int(maximum)} steps)"
        )
    return str(resolved)


@dataclass(frozen=True)
class JobSpec:
    manifest_path: Path
    state_path: Path
    base_model: str
    dataset_path: Path
    output_dir: Path
    resume_from_checkpoint: str | None
    sample_count: int
    max_seq_length: int
    batch_size: int
    gradient_accumulation_steps: int
    num_train_epochs: float
    max_steps: int
    learning_rate: float
    warmup_ratio: float
    warmup_steps: int | None
    weight_decay: float
    logging_steps: int
    save_steps: int
    save_total_limit: int
    seed: int
    lora_r: int
    lora_alpha: int
    lora_dropout: float
    max_samples: int
    dataset_num_proc: int
    packing: bool
    responses_only: bool
    text_only: bool
    trust_remote_code: bool
    bf16: bool
    optim: str
    revision: str | None
    run_name: str


def validate_manifest(manifest: Mapping[str, Any]) -> JobSpec:
    method = _required_text(manifest, "method").lower()
    if method != "qlora":
        raise ManifestError(
            "Only method=qlora is supported on this hardware; full fine-tuning "
            "is intentionally disabled"
        )
    if not _bool_setting(manifest, "load_in_4bit"):
        raise ManifestError("QLoRA requires load_in_4bit=true")

    manifest_path_value = manifest.get("_manifest_path", "manifest.json")
    manifest_path = Path(str(manifest_path_value)).expanduser().resolve()
    base_model = validate_base_model(
        _required_text(manifest, "base_model", "base", "model_name")
    )
    dataset_path = Path(
        _required_text(manifest, "dataset", "dataset_path")
    ).expanduser().resolve()
    sample_count = validate_messages_jsonl(dataset_path)
    output_dir = Path(_required_text(manifest, "output_dir")).expanduser().resolve()
    if output_dir == Path(base_model):
        raise ManifestError("output_dir must not overwrite the base model")
    if output_dir == dataset_path or output_dir in dataset_path.parents:
        raise ManifestError("output_dir must not overwrite the dataset")

    state_value = _first_value(manifest, "state_path")
    if state_value is None:
        state_path = output_dir / "state.json"
    elif isinstance(state_value, str) and state_value.strip():
        state_path = Path(state_value).expanduser().resolve()
    else:
        raise ManifestError("state_path must be a non-empty path")

    resume = validate_resume_checkpoint(
        _first_value(manifest, "resume_from_checkpoint"), output_dir
    )

    overwrite = _bool_setting(manifest, "overwrite_output_dir", default=False)
    if output_dir.exists() and not output_dir.is_dir():
        raise ManifestError(f"output_dir is not a directory: {output_dir}")
    if output_dir.is_dir() and not resume and not overwrite:
        protected = [
            item.name
            for item in output_dir.iterdir()
            if item.name.startswith("checkpoint-")
            or item.name.startswith("adapter_model")
            or item.name == "adapter_config.json"
        ]
        if protected:
            preview = ", ".join(sorted(protected)[:4])
            raise ManifestError(
                f"output_dir already contains training artifacts ({preview}); "
                "use a new job directory or an explicit safe checkpoint"
            )

    max_seq_length = _int_setting(
        manifest, "max_seq_length", "max_length", default=512, minimum=64, maximum=131072
    )
    batch_size = _int_setting(
        manifest,
        "per_device_train_batch_size",
        "batch_size",
        default=1,
        minimum=1,
        maximum=128,
    )
    gradient_accumulation_steps = _int_setting(
        manifest,
        "gradient_accumulation_steps",
        default=16,
        minimum=1,
        maximum=4096,
    )
    num_train_epochs = _float_setting(
        manifest,
        "num_train_epochs",
        "epochs",
        default=1.0,
        minimum=0.000001,
    )
    max_steps = _int_setting(manifest, "max_steps", default=-1, minimum=-1)
    if max_steps == 0:
        max_steps = -1
    learning_rate = _float_setting(
        manifest, "learning_rate", default=2e-4, minimum=1e-9, maximum=1.0
    )
    warmup_ratio = _float_setting(
        manifest, "warmup_ratio", default=0.03, minimum=0.0, maximum=1.0
    )
    warmup_steps = _optional_int_setting(
        manifest, "warmup_steps", minimum=0
    )
    weight_decay = _float_setting(
        manifest, "weight_decay", default=0.001, minimum=0.0, maximum=1.0
    )
    logging_steps = _int_setting(
        manifest, "logging_steps", default=1, minimum=1
    )
    save_steps = _int_setting(manifest, "save_steps", default=100, minimum=1)
    save_total_limit = _int_setting(
        manifest, "save_total_limit", default=3, minimum=1
    )
    seed = _int_setting(manifest, "seed", default=3407, minimum=0, maximum=2**32 - 1)
    lora_r = _int_setting(manifest, "lora_r", "r", default=16, minimum=1, maximum=256)
    lora_alpha = _int_setting(
        manifest, "lora_alpha", default=16, minimum=1, maximum=1024
    )
    lora_dropout = _float_setting(
        manifest, "lora_dropout", default=0.0, minimum=0.0, maximum=0.999999
    )
    max_samples = _int_setting(manifest, "max_samples", default=0, minimum=0)
    dataset_num_proc = _int_setting(
        manifest, "dataset_num_proc", default=1, minimum=1, maximum=64
    )
    packing = _bool_setting(manifest, "packing", default=False)
    responses_only = _bool_setting(
        manifest, "train_on_responses_only", default=True
    )
    text_only = _bool_setting(manifest, "text_only", default=True)
    trust_remote_code = _bool_setting(
        manifest, "trust_remote_code", default=False
    )
    bf16 = _bool_setting(manifest, "bf16", default=True)
    optim_value = _first_value(manifest, "optim")
    optim = "adamw_8bit" if optim_value is None else str(optim_value).strip()
    if not optim:
        raise ManifestError("optim must not be empty")
    revision_value = _first_value(manifest, "revision")
    revision = None if revision_value in (None, "") else str(revision_value).strip()
    run_name_value = _first_value(manifest, "run_name", "name")
    run_name = (
        output_dir.name
        if run_name_value in (None, "")
        else str(run_name_value).strip()
    )

    return JobSpec(
        manifest_path=manifest_path,
        state_path=state_path,
        base_model=base_model,
        dataset_path=dataset_path,
        output_dir=output_dir,
        resume_from_checkpoint=resume,
        sample_count=sample_count,
        max_seq_length=max_seq_length,
        batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        num_train_epochs=num_train_epochs,
        max_steps=max_steps,
        learning_rate=learning_rate,
        warmup_ratio=warmup_ratio,
        warmup_steps=warmup_steps,
        weight_decay=weight_decay,
        logging_steps=logging_steps,
        save_steps=save_steps,
        save_total_limit=save_total_limit,
        seed=seed,
        lora_r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=lora_dropout,
        max_samples=max_samples,
        dataset_num_proc=dataset_num_proc,
        packing=packing,
        responses_only=responses_only,
        text_only=text_only,
        trust_remote_code=trust_remote_code,
        bf16=bf16,
        optim=optim,
        revision=revision,
        run_name=run_name,
    )


def _explicit_parameter(callable_object: Any, name: str) -> bool:
    """Return whether a versioned library explicitly declares a keyword."""

    try:
        return name in inspect.signature(callable_object).parameters
    except (TypeError, ValueError):
        return False


def _print_stage(message: str) -> None:
    print(f"[MiniCursor train] {message}", flush=True)


def _build_progress_callback(base_class: type, state_store: AtomicState) -> Any:
    class ProgressCallback(base_class):
        def __init__(self) -> None:
            self.last_write = 0.0

        def _progress(self, trainer_state: Any) -> dict[str, Any]:
            return {
                "step": int(getattr(trainer_state, "global_step", 0) or 0),
                "max_steps": int(getattr(trainer_state, "max_steps", 0) or 0),
                "epoch": getattr(trainer_state, "epoch", None),
            }

        def on_train_begin(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
            state_store.update(stage="TRAINING", progress=self._progress(state))

        def on_step_end(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
            now = time.monotonic()
            if now - self.last_write >= 2.0:
                self.last_write = now
                state_store.update(progress=self._progress(state))

        def on_log(
            self,
            args: Any,
            state: Any,
            control: Any,
            logs: Mapping[str, Any] | None = None,
            **kwargs: Any,
        ) -> None:
            state_store.update(
                progress=self._progress(state),
                metrics=_json_safe(dict(logs or {})),
            )

        def on_save(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
            step = int(getattr(state, "global_step", 0) or 0)
            state_store.update(
                progress=self._progress(state),
                latest_checkpoint=str(Path(args.output_dir) / f"checkpoint-{step}"),
            )

    return ProgressCallback()


def _format_dataset(dataset: Any, tokenizer: Any, spec: JobSpec) -> Any:
    eos_token = getattr(tokenizer, "eos_token", None)
    if eos_token is None and hasattr(tokenizer, "tokenizer"):
        eos_token = getattr(tokenizer.tokenizer, "eos_token", None)

    def render_batch(batch: Mapping[str, Sequence[Any]]) -> dict[str, list[str]]:
        rendered_samples: list[str] = []
        for messages in batch["messages"]:
            rendered = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            if not isinstance(rendered, str):
                raise RuntimeError("Tokenizer chat template did not return text")
            if eos_token and not rendered.rstrip().endswith(eos_token):
                rendered = rendered.rstrip() + eos_token
            rendered_samples.append(rendered)
        return {"text": rendered_samples}

    if spec.max_samples and len(dataset) > spec.max_samples:
        dataset = dataset.select(range(spec.max_samples))
    map_kwargs: dict[str, Any] = {
        "batched": True,
        "remove_columns": dataset.column_names,
        "desc": "Formatting chat dataset",
    }
    if spec.dataset_num_proc > 1:
        map_kwargs["num_proc"] = spec.dataset_num_proc
    return dataset.map(render_batch, **map_kwargs)


def run_training(spec: JobSpec, state_store: AtomicState) -> dict[str, Any]:
    """Run a validated QLoRA job in the current (training) interpreter."""

    state_store.update(stage="IMPORTING_TRAINING_RUNTIME")
    _print_stage("Loading the isolated Unsloth training runtime")

    # Heavy imports live here by design.  Do not move them to module scope.
    # Unsloth must patch the ML stack before Transformers and TRL are imported.
    from unsloth import FastLanguageModel
    import torch
    from datasets import load_dataset
    from transformers import TrainerCallback
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable in the training environment; refusing to train on CPU"
        )
    device_count = int(torch.cuda.device_count())
    if device_count < 1:
        raise RuntimeError("No NVIDIA CUDA device was found")
    device_name = str(torch.cuda.get_device_name(0))
    bf16_supported = bool(
        getattr(torch.cuda, "is_bf16_supported", lambda: False)()
    )
    if spec.bf16 and not bf16_supported:
        raise RuntimeError(
            "bf16=true was requested, but this CUDA device/runtime does not "
            "report bfloat16 support. Set train.bf16 false to use fp16."
        )
    use_bf16 = spec.bf16
    state_store.update(
        cuda=True,
        device=device_name,
        device_count=device_count,
        precision="bf16" if use_bf16 else "fp16",
    )

    spec.output_dir.mkdir(parents=True, exist_ok=True)
    token_env = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

    state_store.update(stage="LOADING_BASE_MODEL")
    _print_stage(f"Loading 4-bit base model on CUDA: {device_name}")
    model_kwargs: dict[str, Any] = {
        "model_name": spec.base_model,
        "max_seq_length": spec.max_seq_length,
        "dtype": None,
        "load_in_4bit": True,
    }
    optional_model_kwargs = {
        "full_finetuning": False,
        "trust_remote_code": spec.trust_remote_code,
        "use_gradient_checkpointing": "unsloth",
        "random_state": spec.seed,
        "text_only": spec.text_only,
    }
    if token_env:
        optional_model_kwargs["token"] = token_env
    if spec.revision:
        optional_model_kwargs["revision"] = spec.revision
    for name, value in optional_model_kwargs.items():
        if _explicit_parameter(FastLanguageModel.from_pretrained, name):
            model_kwargs[name] = value

    model, tokenizer = FastLanguageModel.from_pretrained(**model_kwargs)
    if getattr(tokenizer, "pad_token", None) is None and getattr(
        tokenizer, "eos_token", None
    ) is not None:
        tokenizer.pad_token = tokenizer.eos_token

    state_store.update(stage="ATTACHING_LORA")
    _print_stage("Attaching LoRA adapters")
    peft_kwargs: dict[str, Any] = {
        "r": spec.lora_r,
        "target_modules": list(TARGET_MODULES),
        "lora_alpha": spec.lora_alpha,
        "lora_dropout": spec.lora_dropout,
        "bias": "none",
        "use_gradient_checkpointing": "unsloth",
        "random_state": spec.seed,
    }
    if _explicit_parameter(FastLanguageModel.get_peft_model, "max_seq_length"):
        peft_kwargs["max_seq_length"] = spec.max_seq_length
    model = FastLanguageModel.get_peft_model(model, **peft_kwargs)

    state_store.update(stage="LOADING_DATASET")
    _print_stage(f"Loading and formatting {spec.sample_count} dataset samples")
    raw_dataset = load_dataset(
        "json", data_files=str(spec.dataset_path), split="train"
    )
    train_dataset = _format_dataset(raw_dataset, tokenizer, spec)
    effective_samples = len(train_dataset)
    if effective_samples < 1:
        raise RuntimeError("Dataset became empty after applying max_samples")

    config_kwargs: dict[str, Any] = {
        "output_dir": str(spec.output_dir),
        "per_device_train_batch_size": spec.batch_size,
        "gradient_accumulation_steps": spec.gradient_accumulation_steps,
        "num_train_epochs": spec.num_train_epochs,
        "learning_rate": spec.learning_rate,
        "weight_decay": spec.weight_decay,
        "optim": spec.optim,
        "logging_strategy": "steps",
        "logging_steps": spec.logging_steps,
        "save_strategy": "steps",
        "save_steps": spec.save_steps,
        "save_total_limit": spec.save_total_limit,
        "report_to": "none",
        "run_name": spec.run_name,
        "seed": spec.seed,
        "data_seed": spec.seed,
        "bf16": use_bf16,
        "fp16": not use_bf16,
        "gradient_checkpointing": True,
        "dataset_text_field": "text",
        "packing": spec.packing,
        "remove_unused_columns": True,
    }
    if spec.warmup_steps is None:
        config_kwargs["warmup_ratio"] = spec.warmup_ratio
    else:
        config_kwargs["warmup_steps"] = spec.warmup_steps
    if spec.max_steps > 0:
        config_kwargs["max_steps"] = spec.max_steps
    if _explicit_parameter(SFTConfig, "max_length"):
        config_kwargs["max_length"] = spec.max_seq_length
    else:
        config_kwargs["max_seq_length"] = spec.max_seq_length
    if _explicit_parameter(SFTConfig, "dataset_num_proc"):
        config_kwargs["dataset_num_proc"] = spec.dataset_num_proc

    training_args = SFTConfig(**config_kwargs)
    progress_callback = _build_progress_callback(TrainerCallback, state_store)
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        processing_class=tokenizer,
        callbacks=[progress_callback],
    )

    if spec.responses_only:
        state_store.update(stage="MASKING_PROMPTS")
        _print_stage("Masking prompts so loss is calculated on assistant replies only")
        from unsloth.chat_templates import train_on_responses_only

        try:
            trainer = train_on_responses_only(trainer)
        except Exception as automatic_error:
            # Qwen-family templates consistently use these ChatML boundaries.
            # The explicit fallback is safer than silently training on user text.
            try:
                trainer = train_on_responses_only(
                    trainer,
                    instruction_part="<|im_start|>user\n",
                    response_part="<|im_start|>assistant\n",
                )
            except Exception as explicit_error:
                raise RuntimeError(
                    "Could not enable assistant-response-only loss; training was "
                    "stopped before the first optimizer step. Automatic error: "
                    f"{automatic_error}; explicit ChatML error: {explicit_error}"
                ) from explicit_error

    state_store.update(
        stage="TRAINING",
        effective_samples=effective_samples,
        resume_from_checkpoint=spec.resume_from_checkpoint,
    )
    _print_stage(
        "Starting training"
        + (
            f" from {Path(spec.resume_from_checkpoint).name}"
            if spec.resume_from_checkpoint
            else ""
        )
    )
    result = trainer.train(resume_from_checkpoint=spec.resume_from_checkpoint)
    metrics = _json_safe(getattr(result, "metrics", {}) or {})

    state_store.update(stage="SAVING_ADAPTER", metrics=metrics)
    _print_stage(f"Saving LoRA adapter to {spec.output_dir}")
    # Persist root-level progress as well as checkpoint-local progress.  The
    # manager uses this to distinguish a finished adapter from an interrupted
    # run that merely has a usable checkpoint.
    trainer.save_state()
    if hasattr(trainer, "save_metrics"):
        trainer.save_metrics("train", metrics)
    model.save_pretrained(str(spec.output_dir))
    tokenizer.save_pretrained(str(spec.output_dir))
    return {
        "metrics": metrics,
        "effective_samples": effective_samples,
        "device": device_name,
        "precision": "bf16" if use_bf16 else "fp16",
    }


def _install_signal_handlers(state_store: AtomicState) -> None:
    def handle_signal(signum: int, frame: Any) -> None:
        name = signal.Signals(signum).name
        try:
            state_store.update(stage="STOPPING", stop_signal=name)
        finally:
            raise KeyboardInterrupt(f"Received {name}")

    for signal_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        number = getattr(signal, signal_name, None)
        if number is None:
            continue
        try:
            signal.signal(number, handle_signal)
        except (OSError, RuntimeError, ValueError):
            pass


def _fallback_state_path(
    manifest_path: Path, manifest: Mapping[str, Any] | None
) -> Path:
    if manifest:
        state_value = _first_value(manifest, "state_path")
        if isinstance(state_value, str) and state_value.strip():
            return Path(state_value).expanduser().resolve()
        output_value = _first_value(manifest, "output_dir")
        if isinstance(output_value, str) and output_value.strip():
            return Path(output_value).expanduser().resolve() / "state.json"
    return manifest_path.parent / "state.json"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniCursor isolated QLoRA worker")
    parser.add_argument("--manifest", required=True, help="Path to the job manifest JSON")
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest).expanduser().resolve()
    manifest: dict[str, Any] | None = None
    state_store: AtomicState | None = None
    try:
        manifest = load_manifest(manifest_path)
        initial_state: dict[str, Any] = {
            "status": "STARTING",
            "pid": os.getpid(),
            "manifest": str(manifest_path),
            "started_at": _utc_now(),
        }
        run_id = manifest.get("run_id")
        if isinstance(run_id, str) and run_id.strip():
            initial_state["run_id"] = run_id.strip()
        state_store = AtomicState(
            _fallback_state_path(manifest_path, manifest),
            initial_state,
        )
        state_store.update(stage="VALIDATING")
        spec = validate_manifest(manifest)
        if spec.state_path != state_store.path:
            state_store = AtomicState(spec.state_path, state_store.data)
            state_store.update(stage="VALIDATING")
        state_store.update(
            status="RUNNING",
            output_dir=str(spec.output_dir),
            dataset=str(spec.dataset_path),
            base_model=spec.base_model,
            method="qlora",
            load_in_4bit=True,
            sample_count=spec.sample_count,
        )
        _install_signal_handlers(state_store)
        result = run_training(spec, state_store)
        state_store.update(
            status="SUCCEEDED",
            stage="COMPLETE",
            finished_at=_utc_now(),
            error=None,
            **result,
        )
        _print_stage("Training completed successfully")
        return 0
    except BaseException as exc:
        # SystemExit from argparse happens before this block is entered.  Once a
        # manifest is accepted, every failure is persisted for `train status`.
        if isinstance(exc, KeyboardInterrupt):
            message = str(exc) or "Training interrupted"
            error_type = "Interrupted"
        else:
            message = str(exc) or exc.__class__.__name__
            error_type = exc.__class__.__name__

        if state_store is None:
            state_store = AtomicState(
                _fallback_state_path(manifest_path, manifest),
                {
                    "pid": os.getpid(),
                    "manifest": str(manifest_path),
                    "started_at": _utc_now(),
                },
            )
        try:
            terminal_status = "CANCELLED" if isinstance(exc, KeyboardInterrupt) else "FAILED"
            state_store.update(
                status=terminal_status,
                stage=terminal_status,
                finished_at=_utc_now(),
                error={
                    "type": error_type,
                    "message": message,
                    "traceback": traceback.format_exc()[-12000:],
                },
            )
        except OSError:
            pass
        print(f"[MiniCursor train] ERROR: {message}", file=sys.stderr, flush=True)
        return 130 if isinstance(exc, KeyboardInterrupt) else 1


if __name__ == "__main__":
    raise SystemExit(main())
