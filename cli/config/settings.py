"""Validated, persistent settings for inference and QLoRA training.

The public API deliberately uses dotted setting names.  This keeps the command
line interface small while still allowing every supported backend option to be
addressed independently (for example, ``generation.top_p``).
"""

from __future__ import annotations

import copy
import json
import math
import os
import re
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final


DEFAULT_SYSTEM_PROMPT: Final = (
    "You are MiniCursor, a local AI coding assistant. Be precise, practical, "
    "and answer in the user's language."
)


class SettingsError(Exception):
    """Base class for configuration errors."""


class SettingsValidationError(SettingsError, ValueError):
    """Raised when a key or value is not supported."""


class SettingsFileError(SettingsError, RuntimeError):
    """Raised when a settings file cannot be read or written safely."""


@dataclass(frozen=True, slots=True)
class _SettingSpec:
    default: Any
    kind: str
    reload_required: bool = False
    minimum: float | None = None
    maximum: float | None = None
    choices: frozenset[Any] | None = None
    allow_empty: bool = True


# Dict insertion order is also the display order used by format().
_SCHEMA: Final[dict[str, _SettingSpec]] = {
    "load.n_ctx": _SettingSpec(8192, "int", True, 256, 1_048_576),
    "load.n_gpu_layers": _SettingSpec(-1, "gpu_layers", True),
    "load.n_batch": _SettingSpec(512, "int", True, 1, 1_048_576),
    "load.n_ubatch": _SettingSpec(512, "int", True, 1, 1_048_576),
    "load.n_threads": _SettingSpec(0, "int", True, 0, 1024),
    "load.n_threads_batch": _SettingSpec(0, "int", True, 0, 1024),
    "load.flash_attn": _SettingSpec(False, "bool", True),
    "load.offload_kqv": _SettingSpec(True, "bool", True),
    "load.use_mmap": _SettingSpec(True, "bool", True),
    "load.use_mlock": _SettingSpec(False, "bool", True),
    "load.seed": _SettingSpec(-1, "seed", True),
    "load.type_k": _SettingSpec("", "int_or_empty", True, 0, 128),
    "load.type_v": _SettingSpec("", "int_or_empty", True, 0, 128),
    "load.chat_format": _SettingSpec("", "str", True),
    "load.lora_path": _SettingSpec("", "str", True),
    "load.lora_scale": _SettingSpec(1.0, "float", True, 0.0, 4.0),
    "load.verbose": _SettingSpec(False, "bool", True),
    "generation.max_tokens": _SettingSpec(4096, "int", False, 1, 1_048_575),
    "generation.temp": _SettingSpec(0.6, "float", False, 0.0, 5.0),
    "generation.top_p": _SettingSpec(0.95, "float", False, 0.0, 1.0),
    "generation.top_k": _SettingSpec(20, "int", False, 0, 100_000),
    "generation.min_p": _SettingSpec(0.0, "float", False, 0.0, 1.0),
    "generation.typical_p": _SettingSpec(1.0, "float", False, 0.0, 1.0),
    "generation.presence_penalty": _SettingSpec(
        0.0, "float", False, -2.0, 2.0
    ),
    "generation.frequency_penalty": _SettingSpec(
        0.0, "float", False, -2.0, 2.0
    ),
    "generation.repeat_penalty": _SettingSpec(1.0, "float", False, 0.0, 5.0),
    "generation.tfs_z": _SettingSpec(1.0, "float", False, 0.0, 1.0),
    "generation.mirostat.mode": _SettingSpec(
        0, "int", False, choices=frozenset({0, 1, 2})
    ),
    "generation.mirostat.tau": _SettingSpec(5.0, "float", False, 0.001, 100.0),
    "generation.mirostat.eta": _SettingSpec(0.1, "float", False, 0.001, 1.0),
    "generation.seed": _SettingSpec(-1, "seed"),
    "generation.stop": _SettingSpec([], "str_list"),
    "chat.system_prompt": _SettingSpec(
        DEFAULT_SYSTEM_PROMPT, "str", allow_empty=False
    ),
    # Unsloth's Qwen3.5 Small GGUF templates default to direct answers unless
    # ``enable_thinking`` is explicitly passed to the embedded Jinja template.
    # Keep the existing fast behaviour as the default and let the CLI opt in.
    "chat.thinking": _SettingSpec(False, "bool"),
    "chat.show_truncation_notice": _SettingSpec(True, "bool"),
    "train.method": _SettingSpec(
        "qlora", "lower_str", choices=frozenset({"qlora"}), allow_empty=False
    ),
    "train.base_model": _SettingSpec("unsloth/Qwen3.5-9B", "str", allow_empty=False),
    "train.dataset": _SettingSpec("", "str"),
    "train.max_seq_length": _SettingSpec(1024, "int", False, 128, 1_048_576),
    "train.batch": _SettingSpec(1, "int", False, 1, 1024),
    "train.grad_accum": _SettingSpec(8, "int", False, 1, 65_536),
    "train.epochs": _SettingSpec(1.0, "float", False, 0.001, 100_000.0),
    "train.max_steps": _SettingSpec(0, "int", False, 0, 2_147_483_647),
    "train.lr": _SettingSpec(2e-5, "float", False, 1e-9, 1.0),
    "train.warmup_steps": _SettingSpec(3, "int", False, 0, 2_147_483_647),
    "train.weight_decay": _SettingSpec(0.001, "float", False, 0.0, 1.0),
    "train.optim": _SettingSpec("adamw_8bit", "str", allow_empty=False),
    "train.bf16": _SettingSpec(True, "bool"),
    "train.seed": _SettingSpec(3407, "int", False, 0, 4_294_967_295),
    "train.logging_steps": _SettingSpec(1, "int", False, 1, 2_147_483_647),
    "train.save_steps": _SettingSpec(50, "int", False, 1, 2_147_483_647),
    "train.save_total_limit": _SettingSpec(3, "int", False, 1, 1000),
    "train.max_samples": _SettingSpec(0, "int", False, 0, 2_147_483_647),
    "train.dataset_num_proc": _SettingSpec(1, "int", False, 1, 64),
    "train.packing": _SettingSpec(False, "bool"),
    "train.responses_only": _SettingSpec(True, "bool"),
    "train.revision": _SettingSpec("", "str"),
    "train.run_name": _SettingSpec("", "str"),
    "train.lora_r": _SettingSpec(16, "int", False, 1, 4096),
    "train.alpha": _SettingSpec(16, "int", False, 1, 1_048_576),
    "train.dropout": _SettingSpec(0.0, "float", False, 0.0, 0.999999),
}


_ALIASES: Final[dict[str, str]] = {
    "load.context": "load.n_ctx",
    "load.gpu_layers": "load.n_gpu_layers",
    "generation.temperature": "generation.temp",
    "chat.reasoning": "chat.thinking",
    "train.model": "train.base_model",
    "train.batch_size": "train.batch",
    "train.per_device_train_batch_size": "train.batch",
    "train.gradient_accumulation_steps": "train.grad_accum",
    "train.learning_rate": "train.lr",
    "train.num_train_epochs": "train.epochs",
    "train.lora_alpha": "train.alpha",
    "train.lora_dropout": "train.dropout",
    "train.train_on_responses_only": "train.responses_only",
}


_PROFILE_KEYS: Final[tuple[str, ...]] = tuple(
    key
    for key in _SCHEMA
    if key.startswith(("load.", "generation.", "chat."))
)


_BUILTIN_PROFILES: Final[dict[str, dict[str, Any]]] = {
    "coding": {
        "generation.max_tokens": 4096,
        "generation.temp": 0.6,
        "generation.top_p": 0.95,
        "generation.top_k": 20,
        "generation.min_p": 0.0,
        "generation.typical_p": 1.0,
        "generation.presence_penalty": 0.0,
        "generation.frequency_penalty": 0.0,
        "generation.repeat_penalty": 1.0,
        "generation.tfs_z": 1.0,
        "generation.mirostat.mode": 0,
    },
    "precise": {
        "generation.max_tokens": 4096,
        "generation.temp": 0.2,
        "generation.top_p": 0.9,
        "generation.top_k": 20,
        "generation.min_p": 0.0,
        "generation.typical_p": 1.0,
        "generation.presence_penalty": 0.0,
        "generation.frequency_penalty": 0.0,
        "generation.repeat_penalty": 1.0,
        "generation.tfs_z": 1.0,
        "generation.mirostat.mode": 0,
    },
    "creative": {
        "generation.max_tokens": 4096,
        "generation.temp": 0.9,
        "generation.top_p": 0.98,
        "generation.top_k": 50,
        "generation.min_p": 0.02,
        "generation.typical_p": 1.0,
        "generation.presence_penalty": 0.0,
        "generation.frequency_penalty": 0.0,
        "generation.repeat_penalty": 1.05,
        "generation.tfs_z": 1.0,
        "generation.mirostat.mode": 0,
    },
}


_PROFILE_NAME = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,63}$")


class SettingsManager:
    """Manage validated settings and named inference profiles.

    Files are only created after a successful mutation.  Every mutation is
    validated as a complete configuration and committed with ``os.replace`` so
    a crash cannot leave a partially-written JSON file behind.
    """

    FILE_VERSION: Final = 1

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = (
            Path(path).expanduser().resolve()
            if path is not None
            else Path(__file__).resolve().with_name("settings.json")
        )
        self._lock = threading.RLock()
        self._values = self._defaults()
        self._profiles: dict[str, dict[str, Any]] = {}
        if self.path.exists():
            self._load_file()

    @staticmethod
    def _defaults() -> dict[str, Any]:
        return {key: copy.deepcopy(spec.default) for key, spec in _SCHEMA.items()}

    @staticmethod
    def _canonical_key(key: str) -> str:
        if not isinstance(key, str):
            raise SettingsValidationError("Setting name must be a string")
        normalized = key.strip().lower()
        normalized = _ALIASES.get(normalized, normalized)
        if normalized not in _SCHEMA:
            raise SettingsValidationError(f"Unknown setting: {key}")
        return normalized

    @staticmethod
    def _normalize_profile_name(name: str) -> str:
        if not isinstance(name, str):
            raise SettingsValidationError("Profile name must be a string")
        normalized = name.strip().lower()
        if not _PROFILE_NAME.fullmatch(normalized):
            raise SettingsValidationError(
                "Profile name must contain 1-64 letters, numbers, '.', '_' or '-'"
            )
        return normalized

    def get(self, key: str) -> Any:
        canonical = self._canonical_key(key)
        with self._lock:
            return copy.deepcopy(self._values[canonical])

    def set(self, key: str, raw_or_typed: Any) -> bool:
        """Set one value and return whether a model reload is required."""

        canonical = self._canonical_key(key)
        parsed = self._parse_value(canonical, raw_or_typed)
        with self._lock:
            if parsed == self._values[canonical]:
                return False
            candidate = copy.deepcopy(self._values)
            candidate[canonical] = parsed
            self._validate_all(candidate)
            self._commit(candidate, self._profiles)
            self._values = candidate
            return _SCHEMA[canonical].reload_required

    def reset(self, key: str | None = None) -> bool:
        """Reset one setting, or all settings, preserving saved profiles."""

        with self._lock:
            candidate = copy.deepcopy(self._values)
            changed_reload_key = False
            if key is None:
                defaults = self._defaults()
                changed_reload_key = any(
                    _SCHEMA[name].reload_required
                    and candidate[name] != defaults[name]
                    for name in _SCHEMA
                )
                candidate = defaults
            else:
                canonical = self._canonical_key(key)
                default = copy.deepcopy(_SCHEMA[canonical].default)
                if candidate[canonical] == default:
                    return False
                candidate[canonical] = default
                changed_reload_key = _SCHEMA[canonical].reload_required

            self._validate_all(candidate)
            self._commit(candidate, self._profiles)
            self._values = candidate
            return changed_reload_key

    def values(self, section: str | None = None) -> dict[str, Any]:
        """Return a defensive copy, optionally with a section prefix removed."""

        with self._lock:
            if section is None:
                return copy.deepcopy(self._values)
            normalized = self._normalize_section(section)
            prefix = f"{normalized}."
            return {
                key[len(prefix) :]: copy.deepcopy(value)
                for key, value in self._values.items()
                if key.startswith(prefix)
            }

    def format(self, section: str | None = None) -> str:
        """Format settings as stable, copyable ``key = JSON value`` lines."""

        if section is None:
            keys = tuple(_SCHEMA)
        else:
            normalized = self._normalize_section(section)
            keys = tuple(key for key in _SCHEMA if key.startswith(f"{normalized}."))
        with self._lock:
            lines = []
            for key in keys:
                value = json.dumps(self._values[key], ensure_ascii=False)
                suffix = "  [reload]" if _SCHEMA[key].reload_required else ""
                lines.append(f"{key} = {value}{suffix}")
            return "\n".join(lines)

    @staticmethod
    def _normalize_section(section: str) -> str:
        if not isinstance(section, str):
            raise SettingsValidationError("Section name must be a string")
        normalized = section.strip().lower().rstrip(".")
        if normalized not in {"load", "generation", "chat", "train"}:
            raise SettingsValidationError(f"Unknown settings section: {section}")
        return normalized

    def load_options(self) -> dict[str, Any]:
        """Return kwargs suitable for the llama.cpp backend loader."""

        options = self.values("load")
        # Zero means llama.cpp should auto-select its thread counts.
        if options["n_threads"] == 0:
            options.pop("n_threads")
        if options["n_threads_batch"] == 0:
            options.pop("n_threads_batch")
        # Empty values mean to use model/backend metadata.
        for key in ("type_k", "type_v", "chat_format", "lora_path"):
            if options[key] == "":
                options.pop(key)
        return options

    def generation_options(self) -> dict[str, Any]:
        """Return kwargs suitable for create_chat_completion()."""

        raw = self.values("generation")
        return {
            "max_tokens": raw["max_tokens"],
            "temperature": raw["temp"],
            "top_p": raw["top_p"],
            "top_k": raw["top_k"],
            "min_p": raw["min_p"],
            "typical_p": raw["typical_p"],
            "presence_penalty": raw["presence_penalty"],
            "frequency_penalty": raw["frequency_penalty"],
            "repeat_penalty": raw["repeat_penalty"],
            "tfs_z": raw["tfs_z"],
            "mirostat_mode": raw["mirostat.mode"],
            "mirostat_tau": raw["mirostat.tau"],
            "mirostat_eta": raw["mirostat.eta"],
            "seed": raw["seed"],
            "stop": raw["stop"],
        }

    def system_prompt(self) -> str:
        return str(self.get("chat.system_prompt"))

    def train_options(self) -> dict[str, Any]:
        """Return normalized kwargs for the isolated training worker."""

        raw = self.values("train")
        return {
            "method": raw["method"],
            "base_model": raw["base_model"],
            "dataset": raw["dataset"],
            "max_seq_length": raw["max_seq_length"],
            "per_device_train_batch_size": raw["batch"],
            "gradient_accumulation_steps": raw["grad_accum"],
            "num_train_epochs": raw["epochs"],
            "max_steps": raw["max_steps"],
            "learning_rate": raw["lr"],
            "warmup_steps": raw["warmup_steps"],
            "weight_decay": raw["weight_decay"],
            "optim": raw["optim"],
            "bf16": raw["bf16"],
            "seed": raw["seed"],
            "logging_steps": raw["logging_steps"],
            "save_steps": raw["save_steps"],
            "save_total_limit": raw["save_total_limit"],
            "max_samples": raw["max_samples"],
            "dataset_num_proc": raw["dataset_num_proc"],
            "packing": raw["packing"],
            "train_on_responses_only": raw["responses_only"],
            "revision": raw["revision"],
            "run_name": raw["run_name"],
            "lora_r": raw["lora_r"],
            "lora_alpha": raw["alpha"],
            "lora_dropout": raw["dropout"],
        }

    def profile_names(self) -> list[str]:
        with self._lock:
            return sorted(set(_BUILTIN_PROFILES) | set(self._profiles))

    def use_profile(self, name: str) -> bool:
        """Apply a built-in or saved profile; return the reload requirement."""

        normalized = self._normalize_profile_name(name)
        with self._lock:
            profile = _BUILTIN_PROFILES.get(normalized)
            if profile is None:
                profile = self._profiles.get(normalized)
            if profile is None:
                raise SettingsValidationError(f"Unknown profile: {name}")

            candidate = copy.deepcopy(self._values)
            candidate.update(copy.deepcopy(profile))
            self._validate_all(candidate)
            changed = {
                key for key in candidate if candidate[key] != self._values[key]
            }
            if not changed:
                return False
            self._commit(candidate, self._profiles)
            self._values = candidate
            return any(_SCHEMA[key].reload_required for key in changed)

    def save_profile(self, name: str) -> None:
        """Save the current inference/chat settings under a custom name."""

        normalized = self._normalize_profile_name(name)
        if normalized in _BUILTIN_PROFILES:
            raise SettingsValidationError(
                f"Built-in profile cannot be overwritten: {normalized}"
            )
        with self._lock:
            profiles = copy.deepcopy(self._profiles)
            profiles[normalized] = {
                key: copy.deepcopy(self._values[key]) for key in _PROFILE_KEYS
            }
            self._commit(self._values, profiles)
            self._profiles = profiles

    def delete_profile(self, name: str) -> None:
        normalized = self._normalize_profile_name(name)
        if normalized in _BUILTIN_PROFILES:
            raise SettingsValidationError(
                f"Built-in profile cannot be deleted: {normalized}"
            )
        with self._lock:
            if normalized not in self._profiles:
                raise SettingsValidationError(f"Unknown custom profile: {name}")
            profiles = copy.deepcopy(self._profiles)
            del profiles[normalized]
            self._commit(self._values, profiles)
            self._profiles = profiles

    def _parse_value(self, key: str, raw: Any) -> Any:
        spec = _SCHEMA[key]
        try:
            if spec.kind == "bool":
                value = self._parse_bool(raw)
            elif spec.kind == "int":
                value = self._parse_int(raw)
            elif spec.kind == "float":
                value = self._parse_float(raw)
            elif spec.kind == "seed":
                value = self._parse_int(raw)
                if value < -1 or value > 4_294_967_295:
                    raise ValueError("must be -1 or an unsigned 32-bit integer")
            elif spec.kind == "gpu_layers":
                value = self._parse_int(raw)
                if value == 0 or value < -1 or value > 100_000:
                    raise ValueError("must be -1 (all layers) or a positive integer")
            elif spec.kind == "int_or_empty":
                if raw is None or (isinstance(raw, str) and not raw.strip()):
                    value = ""
                else:
                    value = self._parse_int(raw)
            elif spec.kind == "str_list":
                value = self._parse_string_list(raw)
            elif spec.kind in {"str", "lower_str"}:
                if not isinstance(raw, str):
                    raise ValueError("must be a string")
                value = raw.strip() if spec.kind == "lower_str" else raw
                if spec.kind == "lower_str":
                    value = value.lower()
            else:  # pragma: no cover - schema authoring guard
                raise AssertionError(f"Unsupported setting kind: {spec.kind}")

            if isinstance(value, str) and not spec.allow_empty and not value.strip():
                raise ValueError("must not be empty")
            if spec.minimum is not None and value != "" and value < spec.minimum:
                raise ValueError(f"must be at least {spec.minimum:g}")
            if spec.maximum is not None and value != "" and value > spec.maximum:
                raise ValueError(f"must be at most {spec.maximum:g}")
            if spec.choices is not None and value not in spec.choices:
                choices = ", ".join(str(item) for item in sorted(spec.choices))
                raise ValueError(f"must be one of: {choices}")
            return value
        except (TypeError, ValueError) as exc:
            if isinstance(exc, SettingsValidationError):
                raise
            raise SettingsValidationError(f"Invalid value for {key}: {exc}") from exc

    @staticmethod
    def _parse_bool(raw: Any) -> bool:
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            normalized = raw.strip().lower()
            if normalized in {"true", "yes", "on", "1"}:
                return True
            if normalized in {"false", "no", "off", "0"}:
                return False
        raise ValueError("must be true or false")

    @staticmethod
    def _parse_int(raw: Any) -> int:
        if isinstance(raw, bool):
            raise ValueError("must be an integer")
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str):
            stripped = raw.strip()
            if re.fullmatch(r"[+-]?\d+", stripped):
                return int(stripped)
        raise ValueError("must be an integer")

    @staticmethod
    def _parse_float(raw: Any) -> float:
        if isinstance(raw, bool):
            raise ValueError("must be a number")
        if isinstance(raw, (int, float)):
            value = float(raw)
        elif isinstance(raw, str):
            try:
                value = float(raw.strip())
            except ValueError as exc:
                raise ValueError("must be a number") from exc
        else:
            raise ValueError("must be a number")
        if not math.isfinite(value):
            raise ValueError("must be finite")
        return value

    @staticmethod
    def _parse_string_list(raw: Any) -> list[str]:
        if isinstance(raw, str):
            stripped = raw.strip()
            if not stripped or stripped == "[]":
                return []
            if stripped.startswith("["):
                try:
                    raw = json.loads(stripped)
                except json.JSONDecodeError as exc:
                    raise ValueError("must be a JSON string array") from exc
            else:
                raw = [part.strip() for part in stripped.split(",")]
        if not isinstance(raw, (list, tuple)):
            raise ValueError("must be a list of strings")
        result: list[str] = []
        for item in raw:
            if not isinstance(item, str) or not item:
                raise ValueError("must contain only non-empty strings")
            result.append(item)
        if len(result) > 128:
            raise ValueError("must contain at most 128 strings")
        return result

    def _validate_all(self, values: dict[str, Any]) -> None:
        if set(values) != set(_SCHEMA):
            missing = sorted(set(_SCHEMA) - set(values))
            unknown = sorted(set(values) - set(_SCHEMA))
            detail = []
            if missing:
                detail.append(f"missing: {', '.join(missing)}")
            if unknown:
                detail.append(f"unknown: {', '.join(unknown)}")
            raise SettingsValidationError("Invalid settings schema (" + "; ".join(detail) + ")")

        # Reparse typed values as a schema integrity check.
        for key in _SCHEMA:
            self._parse_value(key, values[key])

        n_ctx = values["load.n_ctx"]
        n_batch = values["load.n_batch"]
        n_ubatch = values["load.n_ubatch"]
        if not n_ubatch <= n_batch <= n_ctx:
            raise SettingsValidationError(
                "load.n_ubatch must be <= load.n_batch <= load.n_ctx"
            )
        if values["generation.max_tokens"] >= n_ctx:
            raise SettingsValidationError(
                "generation.max_tokens must be smaller than load.n_ctx"
            )

    def _load_file(self) -> None:
        try:
            raw_text = self.path.read_text(encoding="utf-8")
            document = json.loads(raw_text)
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise SettingsFileError(
                f"Cannot read settings file {self.path}: {exc}"
            ) from exc

        try:
            if not isinstance(document, dict):
                raise SettingsValidationError("top level must be an object")
            if document.get("version") != self.FILE_VERSION:
                raise SettingsValidationError(
                    f"unsupported version: {document.get('version')!r}"
                )
            if set(document) - {"version", "values", "profiles"}:
                extra = ", ".join(sorted(set(document) - {"version", "values", "profiles"}))
                raise SettingsValidationError(f"unknown top-level keys: {extra}")

            stored_values = document.get("values", {})
            if not isinstance(stored_values, dict):
                raise SettingsValidationError("values must be an object")
            values = self._defaults()
            for raw_key, raw_value in stored_values.items():
                key = self._canonical_key(raw_key)
                values[key] = self._parse_value(key, raw_value)
            self._validate_all(values)

            stored_profiles = document.get("profiles", {})
            if not isinstance(stored_profiles, dict):
                raise SettingsValidationError("profiles must be an object")
            profiles: dict[str, dict[str, Any]] = {}
            for raw_name, raw_profile in stored_profiles.items():
                name = self._normalize_profile_name(raw_name)
                if name in _BUILTIN_PROFILES:
                    raise SettingsValidationError(
                        f"profile shadows a built-in profile: {name}"
                    )
                if not isinstance(raw_profile, dict) or not raw_profile:
                    raise SettingsValidationError(
                        f"profile {name!r} must be a non-empty object"
                    )
                profile: dict[str, Any] = {}
                for raw_key, raw_value in raw_profile.items():
                    key = self._canonical_key(raw_key)
                    if key not in _PROFILE_KEYS:
                        raise SettingsValidationError(
                            f"profile {name!r} cannot contain {key}"
                        )
                    profile[key] = self._parse_value(key, raw_value)
                trial = self._defaults()
                trial.update(profile)
                self._validate_all(trial)
                profiles[name] = profile
        except SettingsValidationError as exc:
            raise SettingsFileError(
                f"Invalid settings file {self.path}: {exc}"
            ) from exc

        self._values = values
        self._profiles = profiles

    def _commit(
        self,
        values: dict[str, Any],
        profiles: dict[str, dict[str, Any]],
    ) -> None:
        document = {
            "version": self.FILE_VERSION,
            "values": values,
            "profiles": profiles,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                newline="\n",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
                json.dump(
                    document,
                    temporary,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                temporary.write("\n")
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_path, self.path)
        except OSError as exc:
            if temporary_path is not None:
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise SettingsFileError(
                f"Cannot save settings file {self.path}: {exc}"
            ) from exc
