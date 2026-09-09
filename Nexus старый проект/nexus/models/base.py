"""Unified provider interface for Nexus Model System V6."""

from __future__ import annotations

from abc import ABC, abstractmethod

from nexus.models.secrets import SecretStore
from nexus.models.types import DiscoveredModel, ModelEntry, ProviderEntry


class BaseProvider(ABC):
    """Every provider receives one normalized ModelEntry."""

    provider_name = "base"

    def __init__(
        self,
        entry: ModelEntry | ProviderEntry,
        secrets: SecretStore | dict | None = None,
    ):
        if isinstance(entry, ProviderEntry):
            entry = ModelEntry.from_provider_entry(entry)
        if not isinstance(entry, ModelEntry):
            raise TypeError("Providers require ModelEntry or legacy ProviderEntry")
        self.entry = entry
        self.provider = entry
        self.secrets = secrets or {}

    @abstractmethod
    async def generate(self, prompt: str) -> str:
        """Generate a response with the model configured in self.entry."""

    @abstractmethod
    async def check_connection(self) -> bool:
        """Return whether the configured provider endpoint is available."""

    async def list_models(self) -> list[DiscoveredModel]:
        """Optional provider discovery API."""
        return []

    async def test(self, prompt: str = "Hello") -> dict:
        """Check connectivity and send one request through the configured model."""
        try:
            if not await self.check_connection():
                return {
                    "ok": False,
                    "model_id": self.entry.id,
                    "provider": self.entry.provider,
                    "error": "Provider unavailable",
                }
            response = await self.generate(prompt)
            return {
                "ok": True,
                "model_id": self.entry.id,
                "provider": self.entry.provider,
                "model": self.entry.model,
                "response": response[:500],
            }
        except Exception as exc:
            return {
                "ok": False,
                "model_id": self.entry.id,
                "provider": self.entry.provider,
                "error": str(exc),
                "exception": type(exc).__name__,
            }


# Backward-compatible public name. The runtime contract is BaseProvider.
ModelProvider = BaseProvider

__all__ = ["BaseProvider", "ModelProvider"]
