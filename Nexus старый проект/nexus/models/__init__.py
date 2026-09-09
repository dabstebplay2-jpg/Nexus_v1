"""Nexus model system."""

from nexus.models.base import BaseProvider, ModelProvider
from nexus.models.accounts import ProviderAccountManager
from nexus.models.catalog import ModelCatalog
from nexus.models.config import load_models_config, save_models_config
from nexus.models.manager import ModelManager
from nexus.models.migration import migrate_legacy_config
from nexus.models.model_router import ModelRouter
from nexus.models.registry import ModelRegistry
from nexus.models.provider_registry import ProviderRegistry
from nexus.models.secrets import SecureKeyStore
from nexus.models.types import (
    ModelEntry,
    ModelStatus,
    ModelType,
    ProviderAccount,
    ProviderType,
)

__all__ = [
    "ModelEntry",
    "ModelCatalog",
    "BaseProvider",
    "ModelManager",
    "ModelProvider",
    "ModelRegistry",
    "ModelRouter",
    "ModelStatus",
    "ModelType",
    "ProviderType",
    "ProviderAccount",
    "ProviderAccountManager",
    "ProviderRegistry",
    "SecureKeyStore",
    "load_models_config",
    "migrate_legacy_config",
    "save_models_config",
]
