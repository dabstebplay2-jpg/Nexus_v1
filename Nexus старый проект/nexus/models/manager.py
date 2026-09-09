"""Single management boundary for Nexus Model System V6."""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path

from nexus.models.accounts import ProviderAccountManager
from nexus.models.catalog import ModelCatalog
from nexus.models.config import find_config_path, load_models_config, save_models_config
from nexus.models.factory import create_provider, supported_provider_names
from nexus.models.migration import MigrationResult, find_legacy_config, migrate_legacy_config
from nexus.models.registry import ModelRegistry
from nexus.models.secrets import SecretStore
from nexus.models.types import (
    DiscoveredModel,
    ModelEntry,
    ModelStatus,
    ModelType,
    ProviderAccount,
)


class ModelManager:
    """Load, select, persist and connect configured models."""

    def __init__(
        self,
        config_path: str | Path | None = None,
        secret_store: SecretStore | None = None,
        provider_config_path: str | Path | None = None,
    ):
        self.config_path = find_config_path(config_path)
        self.secrets = secret_store or SecretStore()
        self.registry = ModelRegistry()
        account_path = provider_config_path or self.config_path.parent / ".nexus" / "providers.yaml"
        self.accounts = ProviderAccountManager(account_path, secret_store=self.secrets)
        self.provider_accounts = self.accounts
        self.catalog = ModelCatalog(self.registry)
        self._current_id: str | None = None
        self._providers: dict[str, object] = {}
        self._provider_errors: dict[str, str] = {}
        self.catalog_errors: dict[str, str] = {}
        self.migration_result: MigrationResult | None = None
        if config_path is None:
            self.migration_result = migrate_legacy_config(config_path=self.config_path)
        self.reload()

    def reload(self) -> None:
        current, entries = load_models_config(self.config_path)
        self.registry.load_entries(entries)
        self.accounts.reload()
        account_mapping = self.accounts.ensure_from_models(entries)
        for entry in entries:
            entry.provider_account = account_mapping.get(entry.id, entry.provider_account)
            account = self.accounts.get(entry.provider_account)
            if account is not None:
                entry.provider = account.provider
        self._current_id = current if current and self.registry.get(current) else None
        if self._current_id is None and entries:
            self._current_id = entries[0].id
        self._register_providers()

    def _register_providers(self) -> None:
        self._providers.clear()
        self._provider_errors.clear()
        for entry in self.registry.list():
            try:
                account = self.account_for_model(entry)
                if account is None:
                    runtime_entry = entry
                else:
                    payload = entry.to_dict()
                    payload.update(
                        {
                            "provider": account.provider,
                            "provider_account": account.id,
                            "base_url": account.base_url,
                            "api_key_ref": account.api_key_ref,
                            "api_key_env": account.api_key_env,
                        }
                    )
                    runtime_entry = ModelEntry.from_dict(payload)
                self._providers[entry.id] = create_provider(runtime_entry, secrets=self.secrets)
            except Exception as exc:
                self._provider_errors[entry.id] = str(exc)

    def account_for_model(self, model: str | ModelEntry) -> ProviderAccount | None:
        entry = self.get(model) if isinstance(model, str) else model
        if entry is None:
            return self.accounts.get(str(model)) if isinstance(model, str) else None
        account_id = entry.provider_account
        if not account_id and ":" in entry.id:
            account_id = entry.id.split(":", 1)[0]
        return self.accounts.get(account_id or entry.id)

    def _save(self) -> Path:
        return save_models_config(
            self.registry.list(),
            current=self._current_id,
            path=self.config_path,
        )

    def list(self) -> list[ModelEntry]:
        return self.registry.list()

    def list_ids(self) -> list[str]:
        return self.registry.ids()

    def get(self, model_id: str | None) -> ModelEntry | None:
        return self.registry.get(model_id) if model_id is not None else None

    def get_current(self) -> ModelEntry | None:
        return self.get(self._current_id)

    def current_id(self) -> str | None:
        return self._current_id

    def use(self, model_id: str) -> ModelEntry:
        entry = self.registry.get(model_id)
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")
        self._current_id = entry.id
        self._save()
        return entry

    def add(self, entry: ModelEntry) -> ModelEntry:
        added = self.registry.add(entry)
        if self._current_id is None:
            self._current_id = added.id
        self._register_providers()
        self._save()
        return added

    def remove(self, model_id: str) -> bool:
        if not self.registry.remove(model_id):
            return False
        if self._current_id == model_id:
            remaining = self.registry.list()
            self._current_id = remaining[0].id if remaining else None
        self._register_providers()
        self._save()
        return True

    def update(self, model_id: str, **kwargs) -> ModelEntry | None:
        updated = self.registry.update(model_id, **kwargs)
        if updated is None:
            return None
        if self._current_id == model_id:
            self._current_id = updated.id
        self._register_providers()
        self._save()
        return updated

    def resolve_model_id(self, value: str | None) -> str | None:
        if value is None:
            return None
        target = value.strip().lower()
        if self.registry.get(value):
            return value
        exact = [
            entry.id
            for entry in self.registry.list()
            if entry.id.lower() == target or entry.name.lower() == target
        ]
        if exact:
            return exact[0]
        partial = [
            entry.id for entry in self.registry.list() if target in entry.name.lower()
        ]
        return partial[0] if len(partial) == 1 else value

    def get_provider(self, model_id: str | None = None):
        target_id = self.resolve_model_id(model_id) or self._current_id
        if target_id is None:
            raise RuntimeError("No model selected. Use 'nexus models use <id>' first.")
        if target_id in self._provider_errors:
            raise RuntimeError(self._provider_errors[target_id])
        provider = self._providers.get(target_id)
        if provider is None:
            raise KeyError(f"Model not found: {target_id}")
        return provider

    async def check_connection(self, model_id: str | None = None) -> bool:
        target_id = self.resolve_model_id(model_id) or self._current_id
        if target_id is None:
            raise RuntimeError("No model selected")
        try:
            connected = await self.get_provider(target_id).check_connection()
        except Exception:
            self.registry.set_status(target_id, ModelStatus.ERROR)
            raise
        self.registry.set_status(
            target_id,
            ModelStatus.ONLINE if connected else ModelStatus.OFFLINE,
        )
        return connected

    async def test(self, model_id: str | None = None, prompt: str = "Hello") -> dict:
        target_id = self.resolve_model_id(model_id) or self._current_id
        if target_id is None:
            return {"ok": False, "error": "No model selected"}
        try:
            result = await self.get_provider(target_id).test(prompt)
        except Exception as exc:
            self.registry.set_status(target_id, ModelStatus.ERROR)
            return {"ok": False, "model_id": target_id, "error": str(exc)}
        self.registry.set_status(
            target_id,
            ModelStatus.ONLINE if result.get("ok") else ModelStatus.OFFLINE,
        )
        return result

    async def generate(
        self,
        prompt: str,
        model_id: str | None = None,
        context=None,
    ) -> str:
        """Generate through the selected ModelEntry provider.

        Providers keep their V6 ``generate(prompt)`` contract. Optional runtime
        context is serialized here so callers never need provider-specific APIs.
        """
        target_id = self.resolve_model_id(model_id) or self._current_id
        if target_id is None:
            raise RuntimeError("No model selected. Use 'nexus models use <id>' first.")

        entry = self.registry.get(target_id)
        if entry is None:
            raise KeyError(f"Model not found: {target_id}")

        request_prompt = str(prompt)
        if context:
            if isinstance(context, str):
                context_text = context
            else:
                context_text = json.dumps(context, ensure_ascii=False, default=str)
            request_prompt = (
                "Relevant memory context:\n"
                f"{context_text}\n\n"
                f"{request_prompt}"
            )

        provider = self.get_provider(entry.id)
        return await provider.generate(request_prompt)

    @staticmethod
    def _mask_api_key(api_key: str | None) -> str | None:
        if not api_key:
            return None
        if len(api_key) <= 8:
            return "*" * len(api_key)
        return f"{api_key[:4]}...{api_key[-4:]}"

    def set_api_key(self, model_id: str, api_key: str) -> dict:
        entry = self.get(model_id)
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")
        value = str(api_key).strip()
        if not value:
            raise ValueError("API key cannot be empty")
        account = self.account_for_model(entry)
        if account is not None:
            account = self.accounts.set_api_key(account.id, value)
            reference = account.api_key_ref
        else:
            reference = entry.api_key_ref or f"model:{entry.id}"
            self.secrets.set(reference, value)
        for family_entry in self.registry.list():
            shares_reference = (
                family_entry.api_key_ref is not None
                and family_entry.api_key_ref == entry.api_key_ref
            )
            belongs_to_source = (
                family_entry.id == entry.id
                or family_entry.id.startswith(f"{entry.id}:")
            )
            if shares_reference or belongs_to_source:
                self.registry.update(family_entry.id, api_key_ref=reference)
        self._register_providers()
        self._save()
        return self.api_key_info(entry.id)

    def get_api_key(self, model_id: str) -> str | None:
        entry = self.get(model_id)
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")
        account = self.account_for_model(entry)
        if account is not None:
            account_key = self.accounts.get_api_key(account.id)
            if account_key:
                return account_key
        if entry.api_key_ref:
            saved = self.secrets.get(entry.api_key_ref)
            if saved:
                return saved
        if entry.api_key:
            return entry.api_key
        if entry.api_key_env:
            return os.getenv(entry.api_key_env)
        return None

    def api_key_info(self, model_id: str, reveal: bool = False) -> dict:
        entry = self.get(model_id)
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")

        account = self.account_for_model(entry)
        reference = account.api_key_ref if account else entry.api_key_ref
        environment = account.api_key_env if account else entry.api_key_env
        source = None
        if reference and self.secrets.has(reference):
            source = "saved"
        elif entry.api_key:
            source = "runtime"
        elif environment and os.getenv(environment):
            source = f"environment:{environment}"

        key = self.get_api_key(entry.id)
        return {
            "model_id": entry.id,
            "model": entry.name,
            "provider": entry.provider,
            "provider_account": account.id if account else None,
            "configured": key is not None,
            "source": source,
            "reference": reference,
            "value": key if reveal else self._mask_api_key(key),
        }

    def list_api_keys(self) -> list[dict]:
        items: list[dict] = []
        seen_credentials: set[tuple] = set()
        for entry in self.registry.list():
            if entry.api_key_ref:
                identity = ("saved", entry.api_key_ref)
            elif entry.api_key_env:
                identity = ("environment", entry.api_key_env)
            else:
                identity = ("model", entry.id)
            if identity in seen_credentials:
                continue
            seen_credentials.add(identity)
            items.append(self.api_key_info(entry.id))
        return items

    def delete_api_key(self, model_id: str) -> bool:
        entry = self.get(model_id)
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")
        account = self.account_for_model(entry)
        reference = account.api_key_ref if account else entry.api_key_ref
        if not reference:
            return False
        deleted = (
            self.accounts.delete_api_key(account.id)
            if account is not None
            else self.secrets.delete(reference)
        )
        for shared_entry in self.registry.list():
            if shared_entry.api_key_ref == reference:
                self.registry.update(shared_entry.id, api_key_ref=None)
        self._register_providers()
        self._save()
        return deleted

    async def discover_models(self, model_id: str) -> list[DiscoveredModel]:
        entry = self.get(model_id)
        if entry is not None:
            models = await self.get_provider(entry.id).list_models()
        elif self.accounts.get(model_id) is not None:
            models = await self.accounts.discover(model_id)
        else:
            raise KeyError(f"Model or provider account not found: {model_id}")
        if not all(isinstance(model, DiscoveredModel) for model in models):
            raise TypeError("Provider discovery must return DiscoveredModel values")
        return models

    @staticmethod
    def _discovered_entry_id(source_id: str, provider_model_id: str) -> str:
        normalized = re.sub(
            r"[^a-zA-Z0-9_.:/-]+",
            "-",
            str(provider_model_id).strip(),
        ).strip("-")
        if not normalized:
            raise ValueError("Discovered model id cannot be empty")
        return f"{source_id}:{normalized}"

    def register_discovered_models(
        self,
        source_model_id: str,
        discovered: list[DiscoveredModel],
    ) -> list[ModelEntry]:
        """Persist every model exposed by one configured provider connection."""
        source = self.get(source_model_id)
        account = self.account_for_model(source or source_model_id)
        if source is None and account is None:
            raise KeyError(f"Model or provider account not found: {source_model_id}")

        registered: list[ModelEntry] = []
        for remote in discovered:
            if not isinstance(remote, DiscoveredModel):
                raise TypeError("Provider discovery must return DiscoveredModel values")

            account_id = account.id if account else source.id
            local_id = self._discovered_entry_id(account_id, remote.id)
            payload = {
                "name": remote.name or remote.id,
                "provider": account.provider if account else source.provider,
                "provider_account": account_id,
                "model": remote.id,
                "type": remote.type or (source.type if source else account.model_type),
                "capabilities": remote.capabilities or (list(source.capabilities) if source else []),
                "context_length": remote.context_length or 0,
                "api_key_ref": source.api_key_ref if source else None,
                "api_key_env": source.api_key_env if source else None,
                "base_url": source.base_url if source else None,
            }
            existing = self.registry.get(local_id)
            if existing is None:
                entry = ModelEntry(id=local_id, **payload)
                self.registry.add(entry)
            else:
                entry = self.registry.update(local_id, **payload)
            registered.append(entry)

        self._register_providers()
        self._save()
        return registered

    async def refresh_catalog(self, provider_account: str | None = None) -> list[ModelEntry]:
        account_ids = (
            [provider_account]
            if provider_account
            else [account.id for account in self.accounts.list()]
        )
        refreshed: list[ModelEntry] = []
        self.catalog_errors = {}
        for account_id in account_ids:
            try:
                refreshed.extend(await self.discover_and_register_models(account_id))
            except Exception as exc:
                self.catalog_errors[account_id] = str(exc)
        return refreshed

    def list_provider_accounts(self) -> list[ProviderAccount]:
        return self.accounts.list()

    def add_provider_account(self, account: ProviderAccount, api_key: str | None = None):
        added = self.accounts.add(account, api_key=api_key)
        self._register_providers()
        return added

    def update_provider_account(self, account_id: str, **changes) -> ProviderAccount:
        updated = self.accounts.update(account_id, **changes)
        self._register_providers()
        return updated

    def remove_provider_account(
        self,
        account_id: str,
        *,
        delete_key: bool = True,
        remove_models: bool = True,
    ) -> bool:
        if self.accounts.get(account_id) is None:
            return False
        if remove_models:
            removed_ids = [entry.id for entry in self.catalog.list(account_id)]
            for model_id in removed_ids:
                self.registry.remove(model_id)
            if self._current_id in removed_ids:
                remaining = self.registry.list()
                self._current_id = remaining[0].id if remaining else None
        self.accounts.remove(account_id, delete_key=delete_key)
        self._register_providers()
        self._save()
        return True

    async def test_provider_account(self, account_id: str) -> dict:
        return await self.accounts.test(account_id)

    def set_provider_api_key(self, account_id: str, api_key: str) -> ProviderAccount:
        account = self.accounts.set_api_key(account_id, api_key)
        self._register_providers()
        return account

    def delete_provider_api_key(self, account_id: str) -> bool:
        deleted = self.accounts.delete_api_key(account_id)
        self._register_providers()
        return deleted

    async def discover_and_register_models(
        self,
        source_model_id: str,
    ) -> list[ModelEntry]:
        discovered = await self.discover_models(source_model_id)
        return self.register_discovered_models(source_model_id, discovered)

    def select_provider_model(
        self,
        model_id: str,
        provider_model_id: str,
    ) -> ModelEntry:
        entry = self.update(model_id, model=str(provider_model_id))
        if entry is None:
            raise KeyError(f"Model not found: {model_id}")
        self.use(entry.id)
        return entry

    def refresh_status_sync(self) -> list[ModelEntry]:
        return asyncio.run(self.refresh_status())

    async def refresh_status(self) -> list[ModelEntry]:
        connection_groups: dict[tuple, list[ModelEntry]] = {}
        for entry in self.registry.list():
            fingerprint = (
                entry.provider_account or entry.provider,
                entry.base_url,
                entry.api_key_ref,
                entry.api_key_env,
            )
            connection_groups.setdefault(fingerprint, []).append(entry)

        for entries in connection_groups.values():
            entry = entries[0]
            try:
                connected = await self.check_connection(entry.id)
                status = ModelStatus.ONLINE if connected else ModelStatus.OFFLINE
            except Exception:
                status = ModelStatus.ERROR
            for grouped_entry in entries:
                self.registry.set_status(grouped_entry.id, status)
        return self.registry.list()

    def summary(self) -> dict:
        current = self.get_current()
        return {
            "current": current.name if current else None,
            "current_id": self._current_id,
            "count": self.registry.count(),
            "provider_accounts": self.accounts.registry.count(),
            "models": [
                {
                    "id": entry.id,
                    "name": entry.name,
                    "provider": entry.provider,
                    "type": entry.type,
                    "capabilities": entry.capabilities_text,
                    "status": entry.status,
                    "context_length": entry.context_length,
                }
                for entry in self.registry.list()
            ],
        }

    @staticmethod
    def build_entry(
        model_id: str,
        name: str,
        provider: str,
        model: str,
        model_type: str = ModelType.CLOUD.value,
        capabilities: list[str] | None = None,
        context_length: int = 0,
        base_url: str | None = None,
        api_key_env: str | None = None,
    ) -> ModelEntry:
        return ModelEntry(
            id=model_id,
            name=name,
            provider=provider,
            model=model,
            type=model_type,
            capabilities=capabilities or [],
            context_length=context_length,
            base_url=base_url,
            api_key_env=api_key_env,
        )

    @staticmethod
    def supported_providers() -> list[str]:
        return supported_provider_names()

    async def diagnose(self) -> dict:
        result = {}
        for entry in self.registry.list():
            try:
                provider = self.get_provider(entry.id)
                if hasattr(provider, "diagnose"):
                    result[entry.id] = await provider.diagnose()
                else:
                    result[entry.id] = {
                        "ok": await provider.check_connection(),
                        "provider": entry.provider,
                    }
            except Exception as exc:
                result[entry.id] = {"ok": False, "error": str(exc)}
        return result

    def doctor(self) -> dict:
        warnings_list: list[str] = []
        legacy_path = find_legacy_config(self.config_path)
        if legacy_path.exists():
            warnings_list.append(f"Legacy config detected: {legacy_path}")

        config_ok = self.config_path.exists()
        registry_ok = all(isinstance(entry, ModelEntry) for entry in self.registry.list())
        providers_ok = not self._provider_errors
        current_ok = self._current_id is None or self.get_current() is not None
        return {
            "checks": {
                "config": config_ok,
                "registry": registry_ok,
                "providers": providers_ok,
                "current_model": current_ok,
            },
            "warnings": warnings_list,
            "provider_errors": dict(self._provider_errors),
        }

    def scan(self) -> list[ModelEntry]:
        from nexus.models.scanner import scan_all

        supported = set(supported_provider_names())
        discovered = [
            entry
            for entry in (ModelEntry.from_dict(item) for item in scan_all())
            if entry.provider in supported
        ]
        for entry in discovered:
            if self.registry.get(entry.id) is None:
                self.registry.add(entry)
        self._register_providers()
        self._save()
        return discovered

    def analyze(self) -> list[dict]:
        from nexus.models.analyzer import analyze
        from nexus.models.hardware import detect_hardware

        hardware = detect_hardware()
        return [analyze(entry.to_dict(), hardware) for entry in self.registry.list()]

    def recommend(self) -> list[tuple[int, dict]]:
        from nexus.models.recommender import recommend

        return recommend([entry.to_dict() for entry in self.registry.list()])

    async def chat(self, prompt: str, model_id: str | None = None) -> dict:
        return await self.test(model_id=model_id, prompt=prompt)

    async def interactive_chat(self) -> None:
        while True:
            try:
                prompt = input("\nYou > ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if prompt.lower() in {"exit", "quit", "/exit"}:
                break
            result = await self.chat(prompt)
            print(result.get("response") if result.get("ok") else result.get("error"))

    async def nexus_terminal_chat(self) -> None:
        await self.interactive_chat()
