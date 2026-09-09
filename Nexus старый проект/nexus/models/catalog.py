"""Model catalog backed by the canonical ModelRegistry."""

from __future__ import annotations

from nexus.models.registry import ModelRegistry
from nexus.models.types import ModelEntry


class ModelCatalog:
    def __init__(self, registry: ModelRegistry):
        self.registry = registry

    def list(self, provider_account: str | None = None) -> list[ModelEntry]:
        entries = self.registry.list()
        if provider_account is None:
            return entries
        return [
            entry
            for entry in entries
            if entry.provider_account == provider_account
            or entry.id == provider_account
            or entry.id.startswith(f"{provider_account}:")
        ]

    def get(self, qualified_id: str) -> ModelEntry | None:
        return self.registry.get(qualified_id)

    def qualified_id(self, provider_account: str, remote_model_id: str) -> str:
        return f"{provider_account}:{remote_model_id}"


__all__ = ["ModelCatalog"]
