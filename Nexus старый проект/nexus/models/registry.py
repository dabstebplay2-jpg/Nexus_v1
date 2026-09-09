"""In-memory ModelEntry registry for Nexus Model System V6."""

from __future__ import annotations

from dataclasses import fields
import json
from pathlib import Path
from typing import Iterable
import warnings

from nexus.models.types import ModelEntry, normalize_status


class ModelRegistry:
    """Store ModelEntry objects in configuration order."""

    def __init__(self, entries: Iterable[ModelEntry] | None = None):
        self.models: list[ModelEntry] = []
        if entries is not None:
            self.load_entries(entries)

    @staticmethod
    def _require_entry(model: ModelEntry) -> ModelEntry:
        if not isinstance(model, ModelEntry):
            raise TypeError("ModelRegistry accepts only ModelEntry values")
        return model

    def load_entries(self, entries: Iterable[ModelEntry] | None) -> list[ModelEntry]:
        self.clear()
        for entry in entries or []:
            self.add(entry)
        return self.list()

    def list(self) -> list[ModelEntry]:
        return list(self.models)

    def all(self) -> list[ModelEntry]:
        return self.list()

    def entries(self) -> list[ModelEntry]:
        """Deprecated alias for list()."""
        return self.list()

    def get(self, model_id: str) -> ModelEntry | None:
        return next((model for model in self.models if model.id == model_id), None)

    def add(self, model: ModelEntry) -> ModelEntry:
        entry = self._require_entry(model)
        if self.get(entry.id) is not None:
            raise ValueError(f"Model already exists: {entry.id}")
        self.models.append(entry)
        return entry

    def register(self, model: ModelEntry) -> ModelEntry:
        return self.add(model)

    def remove(self, model_id: str) -> bool:
        model = self.get(model_id)
        if model is None:
            return False
        self.models.remove(model)
        return True

    def update(self, model_id: str, **kwargs) -> ModelEntry | None:
        current = self.get(model_id)
        if current is None:
            return None

        valid_fields = {field.name for field in fields(ModelEntry)}
        unknown_fields = set(kwargs) - valid_fields
        if unknown_fields:
            raise AttributeError(f"Unknown ModelEntry fields: {sorted(unknown_fields)}")

        payload = current.to_dict()
        payload["api_key"] = current.api_key
        payload.update(kwargs)
        updated = ModelEntry.from_dict(payload)
        if updated.id != model_id and self.get(updated.id) is not None:
            raise ValueError(f"Model already exists: {updated.id}")

        index = self.models.index(current)
        self.models[index] = updated
        return updated

    def set_status(self, model_id: str, status) -> ModelEntry | None:
        model = self.get(model_id)
        if model is None:
            return None
        model.status = normalize_status(status)
        return model

    def clear(self) -> None:
        self.models.clear()

    def count(self) -> int:
        return len(self.models)

    def ids(self) -> list[str]:
        return [model.id for model in self.models]


# LEGACY - deprecated. JSON is retained only for migration compatibility.
LEGACY_REGISTRY_PATH = Path(".nexus/models.json")


def load(path: str | Path | None = None) -> list[dict]:
    warnings.warn(
        "nexus.models.registry.load() is deprecated; migrate JSON to models.yaml",
        DeprecationWarning,
        stacklevel=2,
    )
    registry_path = Path(path) if path is not None else LEGACY_REGISTRY_PATH
    if not registry_path.exists():
        return []
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("models", [])
    return data if isinstance(data, list) else []


def save(models: list, path: str | Path | None = None) -> Path:
    warnings.warn(
        "nexus.models.registry.save() is deprecated; use ModelManager",
        DeprecationWarning,
        stacklevel=2,
    )
    registry_path = Path(path) if path is not None else LEGACY_REGISTRY_PATH
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps(models, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return registry_path
