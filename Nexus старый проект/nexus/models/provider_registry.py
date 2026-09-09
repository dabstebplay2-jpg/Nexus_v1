"""Provider account registry for Model Architecture V7."""

from __future__ import annotations

from typing import Iterable

from nexus.models.types import ProviderAccount


class ProviderRegistry:
    def __init__(self, accounts: Iterable[ProviderAccount] | None = None):
        self._accounts: dict[str, ProviderAccount] = {}
        for account in accounts or []:
            self.register(account)

    def register(self, provider):
        if not isinstance(provider, ProviderAccount):
            # Preserve the permissive legacy result for external callers.
            return {"provider": provider, "status": "registered"}
        if provider.id in self._accounts:
            raise ValueError(f"Provider account already exists: {provider.id}")
        self._accounts[provider.id] = provider
        return provider

    add = register

    def get(self, account_id: str) -> ProviderAccount | None:
        return self._accounts.get(str(account_id))

    def list(self) -> list[ProviderAccount]:
        return list(self._accounts.values())

    def remove(self, account_id: str) -> bool:
        if account_id not in self._accounts:
            return False
        del self._accounts[account_id]
        return True

    def clear(self) -> None:
        self._accounts.clear()

    def count(self) -> int:
        return len(self._accounts)
