"""Canonical YAML configuration for the Nexus model system."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import yaml

from nexus.models.types import ModelEntry


DEFAULT_PATH = Path("models.yaml")


class ModelConfigError(ValueError):
    """Raised when the canonical model configuration is invalid."""


def find_config_path(path: str | Path | None = None) -> Path:
    """Return the canonical YAML path; legacy discovery belongs to migration.py."""
    config_path = Path(path) if path is not None else DEFAULT_PATH
    if config_path.suffix.lower() not in {".yaml", ".yml"}:
        raise ModelConfigError(
            f"Model config must be YAML: {config_path}. "
            "Use nexus.models.migration for legacy JSON."
        )
    return config_path


def load_models_config(
    path: str | Path | None = None,
) -> tuple[str | None, list[ModelEntry]]:
    """Load the canonical ``current/models`` YAML document."""
    config_path = find_config_path(path)
    if not config_path.exists():
        return None, []

    try:
        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ModelConfigError(f"Cannot read model config {config_path}: {exc}") from exc

    if not isinstance(data, dict):
        raise ModelConfigError(
            f"Model config {config_path} must contain a mapping with 'models'"
        )

    raw_entries = data.get("models", [])
    if not isinstance(raw_entries, list):
        raise ModelConfigError(f"'models' must be a list in {config_path}")

    entries: list[ModelEntry] = []
    for index, raw_entry in enumerate(raw_entries):
        try:
            entries.append(ModelEntry.from_dict(raw_entry))
        except (TypeError, ValueError) as exc:
            raise ModelConfigError(
                f"Invalid model entry at index {index} in {config_path}: {exc}"
            ) from exc

    current = data.get("current")
    return (str(current) if current is not None else None), entries


def save_models_config(
    entries: Iterable[ModelEntry],
    current: str | None = None,
    path: str | Path | None = None,
) -> Path:
    """Persist ModelEntry values to the canonical YAML document."""
    config_path = find_config_path(path)
    normalized = list(entries)
    if not all(isinstance(entry, ModelEntry) for entry in normalized):
        raise TypeError("save_models_config accepts only ModelEntry values")

    config_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "current": current,
        "models": [entry.to_dict() for entry in normalized],
    }
    with config_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            payload,
            handle,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
        )
    return config_path
