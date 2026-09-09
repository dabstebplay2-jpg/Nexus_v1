"""Provider Account Layer for Nexus Model Architecture V7."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from nexus.models.factory import create_provider, supported_provider_names
from nexus.models.provider_config import load_provider_accounts, save_provider_accounts
from nexus.models.provider_registry import ProviderRegistry
from nexus.models.secrets import SecretStore
from nexus.models.types import DiscoveredModel, ModelEntry, ModelStatus, ProviderAccount


class ProviderAccountManager:
    def __init__(
        self,
        config_path: str | Path | None = None,
        secret_store: SecretStore | None = None,
    ):
        self.config_path = Path(config_path or Path(".nexus/providers.yaml"))
        self.secrets = secret_store or SecretStore()
        self.registry = ProviderRegistry()
        self.reload()

    def reload(self) -> None:
        self.registry.clear()
        for account in load_provider_accounts(self.config_path):
            self.registry.register(account)

    def _save(self) -> Path:
        return save_provider_accounts(self.registry.list(), self.config_path)

    def list(self) -> list[ProviderAccount]:
        return self.registry.list()

    def get(self, account_id: str | None) -> ProviderAccount | None:
        return self.registry.get(account_id) if account_id else None

    def add(self, account: ProviderAccount, api_key: str | None = None) -> ProviderAccount:
        if account.provider not in supported_provider_names():
            raise ValueError(f"Unsupported provider type: {account.provider}")
        if account.provider == "openai_compatible" and not account.base_url:
            raise ValueError("base_url is required for openai_compatible provider accounts")
        if api_key:
            account.api_key_ref = account.api_key_ref or f"provider:{account.id}"
            self.secrets.set(account.api_key_ref, api_key)
        added = self.registry.register(account)
        self._save()
        return added

    def update(self, account_id: str, **changes) -> ProviderAccount:
        current = self.get(account_id)
        if current is None:
            raise KeyError(f"Provider account not found: {account_id}")
        payload = current.to_dict()
        payload.update(changes)
        updated = ProviderAccount.from_dict(payload)
        self.registry.remove(account_id)
        self.registry.register(updated)
        self._save()
        return updated

    def remove(self, account_id: str, delete_key: bool = False) -> bool:
        account = self.get(account_id)
        if account is None:
            return False
        if delete_key and account.api_key_ref:
            self.secrets.delete(account.api_key_ref)
        self.registry.remove(account_id)
        self._save()
        return True

    def set_api_key(self, account_id: str, api_key: str) -> ProviderAccount:
        value = str(api_key).strip()
        if not value:
            raise ValueError("API key cannot be empty")
        account = self.get(account_id)
        if account is None:
            raise KeyError(f"Provider account not found: {account_id}")
        reference = account.api_key_ref or f"provider:{account.id}"
        self.secrets.set(reference, value)
        return self.update(account.id, api_key_ref=reference)

    def get_api_key(self, account_id: str) -> str | None:
        account = self.get(account_id)
        if account is None:
            raise KeyError(f"Provider account not found: {account_id}")
        if account.api_key_ref:
            saved = self.secrets.get(account.api_key_ref)
            if saved:
                return saved
        if account.api_key_env:
            return os.getenv(account.api_key_env)
        return None

    def delete_api_key(self, account_id: str) -> bool:
        account = self.get(account_id)
        if account is None:
            raise KeyError(f"Provider account not found: {account_id}")
        if not account.api_key_ref:
            return False
        deleted = self.secrets.delete(account.api_key_ref)
        self.update(account.id, api_key_ref=None)
        return deleted

    def ensure_from_models(self, entries: Iterable[ModelEntry]) -> dict[str, str]:
        """Create missing accounts from V6 ModelEntry connection fields."""
        mapping: dict[str, str] = {}
        changed = False
        model_entries = list(entries)
        ids = {entry.id for entry in model_entries}
        for entry in model_entries:
            account_id = entry.provider_account
            if not account_id and ":" in entry.id and entry.id.split(":", 1)[0] in ids:
                account_id = entry.id.split(":", 1)[0]
            account_id = account_id or entry.id
            mapping[entry.id] = account_id
            if self.get(account_id) is not None:
                continue
            account = ProviderAccount(
                id=account_id,
                name=f"{entry.name} Provider",
                provider=entry.provider,
                base_url=entry.base_url,
                api_key_ref=entry.api_key_ref,
                api_key_env=entry.api_key_env,
            )
            self.registry.register(account)
            changed = True
        if changed:
            self._save()
        return mapping

    def provider_for(self, account_id: str, model: str = "discovery"):
        account = self.get(account_id)
        if account is None:
            raise KeyError(f"Provider account not found: {account_id}")
        return create_provider(account.to_model_entry(model=model), secrets=self.secrets)

    async def test(self, account_id: str) -> dict:
        account = self.get(account_id)
        if account is None:
            return {"ok": False, "account_id": account_id, "error": "Provider account not found"}
        try:
            ok = await self.provider_for(account_id).check_connection()
            self.update(
                account_id,
                status=ModelStatus.ONLINE.value if ok else ModelStatus.OFFLINE.value,
            )
            return {
                "ok": ok,
                "account_id": account_id,
                "provider": account.provider,
                "status": "online" if ok else "offline",
            }
        except Exception as exc:
            self.update(account_id, status=ModelStatus.ERROR.value)
            return {
                "ok": False,
                "account_id": account_id,
                "provider": account.provider,
                "status": "error",
                "error": str(exc),
            }

    async def discover(self, account_id: str) -> list[DiscoveredModel]:
        models = await self.provider_for(account_id).list_models()
        if not all(isinstance(model, DiscoveredModel) for model in models):
            raise TypeError("Provider discovery must return DiscoveredModel values")
        return models


__all__ = ["ProviderAccountManager"]
