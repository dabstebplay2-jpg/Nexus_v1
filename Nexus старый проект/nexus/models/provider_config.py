"""Canonical Provider Account configuration for Model Architecture V7."""

from __future__ import annotations

from pathlib import Path

import yaml

from nexus.models.types import ProviderAccount, ProviderEntry

DEFAULT_PROVIDER_PATHS = [
    Path(".nexus/providers.yaml"),
    Path("providers.yaml"),
]


def find_provider_config_path(path: Path | None = None) -> Path:
    if path:
        return path
    for candidate in DEFAULT_PROVIDER_PATHS:
        if candidate.exists():
            return candidate
    return DEFAULT_PROVIDER_PATHS[0]


def load_providers_config(path: Path | None = None) -> list[ProviderEntry]:
    """Backward-compatible ProviderEntry loader."""
    config_path = find_provider_config_path(path)
    if not config_path.exists():
        return []

    with config_path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    return [ProviderEntry.from_dict(item) for item in data.get("providers", [])]


def save_providers_config(
    providers: list[ProviderEntry],
    path: Path | None = None,
) -> Path:
    config_path = path or find_provider_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {"providers": [provider.to_dict() for provider in providers]}
    with config_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(payload, handle, default_flow_style=False, sort_keys=False)

    return config_path


def load_provider_accounts(path: Path | None = None) -> list[ProviderAccount]:
    config_path = find_provider_config_path(path)
    if not config_path.exists():
        return []
    with config_path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    raw_accounts = data.get("accounts", data.get("providers", []))
    if not isinstance(raw_accounts, list):
        raise ValueError(f"Provider accounts must be a list in {config_path}")
    return [ProviderAccount.from_dict(item) for item in raw_accounts]


def save_provider_accounts(
    accounts: list[ProviderAccount],
    path: Path | None = None,
) -> Path:
    if not all(isinstance(account, ProviderAccount) for account in accounts):
        raise TypeError("save_provider_accounts accepts only ProviderAccount values")
    config_path = path or find_provider_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 7, "accounts": [account.to_dict() for account in accounts]}
    with config_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            payload,
            handle,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
        )
    return config_path
