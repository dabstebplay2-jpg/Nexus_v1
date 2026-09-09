"""Canonical data types for Nexus Model System V6."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ProviderType(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OLLAMA = "ollama"
    LMSTUDIO = "lmstudio"
    OPENAI_COMPATIBLE = "openai_compatible"
    CUSTOM = "custom"


class ModelType(str, Enum):
    CLOUD = "cloud"
    LOCAL = "local"


class ModelStatus(str, Enum):
    CONNECTED = "online"
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    UNKNOWN = "unknown"


PROVIDER_LABELS = {
    ProviderType.OPENAI.value: "OpenAI",
    ProviderType.ANTHROPIC.value: "Anthropic",
    ProviderType.GEMINI.value: "Google Gemini",
    ProviderType.OLLAMA.value: "Ollama",
    ProviderType.LMSTUDIO.value: "LM Studio",
    ProviderType.OPENAI_COMPATIBLE.value: "OpenAI-compatible",
    ProviderType.CUSTOM.value: "Custom",
}
LOCAL_PROVIDERS = {
    ProviderType.OLLAMA.value,
    ProviderType.LMSTUDIO.value,
}
KNOWN_PROVIDERS = {provider.value for provider in ProviderType}
VALID_MODEL_TYPES = {model_type.value for model_type in ModelType}
STATUS_ALIASES = {
    "connected": ModelStatus.ONLINE.value,
    "online": ModelStatus.ONLINE.value,
    "offline": ModelStatus.OFFLINE.value,
    "error": ModelStatus.ERROR.value,
    "unknown": ModelStatus.UNKNOWN.value,
}


@dataclass
class ProviderAccount:
    """A provider connection and credential reference, independent of models."""

    id: str
    name: str | None = None
    provider: str = "openai_compatible"
    base_url: str | None = None
    api_key_ref: str | None = None
    api_key_env: str | None = None
    status: str = ModelStatus.UNKNOWN.value
    metadata: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.id = str(self.id).strip()
        if not self.id:
            raise ValueError("Provider account id cannot be empty")
        self.name = str(self.name or self.id)
        self.provider = str(_enum_value(self.provider) or "openai_compatible").lower()
        self.status = normalize_status(self.status)
        self.metadata = dict(self.metadata or {})

    @property
    def model_type(self) -> str:
        return (
            ModelType.LOCAL.value
            if self.provider in LOCAL_PROVIDERS
            else ModelType.CLOUD.value
        )

    def to_model_entry(self, model: str = "discovery") -> ModelEntry:
        return ModelEntry(
            id=self.id,
            name=self.name,
            provider=self.provider,
            provider_account=self.id,
            model=model,
            type=self.model_type,
            base_url=self.base_url,
            api_key_ref=self.api_key_ref,
            api_key_env=self.api_key_env,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "base_url": self.base_url,
            "api_key_ref": self.api_key_ref,
            "api_key_env": self.api_key_env,
            "status": self.status,
            "metadata": dict(self.metadata),
        }

    @classmethod
    def from_dict(cls, data: dict) -> ProviderAccount:
        if not isinstance(data, dict):
            raise TypeError("Provider account must be a mapping")
        return cls(
            id=str(data["id"]),
            name=data.get("name"),
            provider=data.get("provider") or data.get("type") or "openai_compatible",
            base_url=data.get("base_url"),
            api_key_ref=data.get("api_key_ref"),
            api_key_env=data.get("api_key_env"),
            status=data.get("status", ModelStatus.UNKNOWN.value),
            metadata=data.get("metadata") or {},
        )


def _enum_value(value):
    return value.value if isinstance(value, Enum) else value


def normalize_status(value) -> str:
    status = str(_enum_value(value) or ModelStatus.UNKNOWN.value).lower()
    if status not in STATUS_ALIASES:
        raise ValueError(f"Unknown model status: {value}")
    return STATUS_ALIASES[status]


@dataclass
class ProviderEntry:
    """Legacy provider configuration, normalized before entering runtime."""

    id: str
    name: str
    type: str
    base_url: str | None = None
    api_key_ref: str | None = None
    api_key_env: str | None = None
    status: str = ModelStatus.UNKNOWN.value

    @property
    def provider_name(self) -> str:
        provider_type = str(_enum_value(self.type)).lower()
        provider_id = str(self.id).lower()
        if provider_type in KNOWN_PROVIDERS:
            return provider_type
        if provider_id in KNOWN_PROVIDERS:
            return provider_id
        return provider_type

    @property
    def model_type(self) -> str:
        return (
            ModelType.LOCAL.value
            if self.provider_name in LOCAL_PROVIDERS or self.type == ModelType.LOCAL.value
            else ModelType.CLOUD.value
        )

    @property
    def type_label(self) -> str:
        return PROVIDER_LABELS.get(self.provider_name, self.provider_name)

    def to_model_entry(self) -> ModelEntry:
        return ModelEntry(
            id=str(self.id),
            name=self.name,
            provider=self.provider_name,
            model=str(self.id),
            type=self.model_type,
            api_key_ref=self.api_key_ref,
            api_key_env=self.api_key_env,
            base_url=self.base_url,
            status=self.status,
        )

    def to_dict(self) -> dict:
        data = {"id": self.id, "name": self.name, "type": self.type}
        if self.base_url:
            data["base_url"] = self.base_url
        if self.api_key_ref:
            data["api_key_ref"] = self.api_key_ref
        if self.api_key_env:
            data["api_key_env"] = self.api_key_env
        return data

    @classmethod
    def from_dict(cls, data: dict) -> ProviderEntry:
        return cls(
            id=str(data["id"]),
            name=str(data.get("name", data["id"])),
            type=str(data["type"]),
            base_url=data.get("base_url"),
            api_key_ref=data.get("api_key_ref"),
            api_key_env=data.get("api_key_env"),
            status=normalize_status(data.get("status", ModelStatus.UNKNOWN.value)),
        )


@dataclass
class DiscoveredModel:
    id: str
    name: str
    provider_id: str
    type: str = ModelType.CLOUD.value
    capabilities: list[str] = field(default_factory=list)
    context_length: int = 0


@dataclass
class ModelEntry:
    """The only model representation allowed inside runtime and registry."""

    id: str
    name: str | None = None
    provider: str = "unknown"
    provider_account: str | None = None
    model: str | None = None
    type: str = ModelType.CLOUD.value
    capabilities: list[str] = field(default_factory=list)
    status: str = ModelStatus.UNKNOWN.value
    context_length: int = 0
    api_key_ref: str | None = None
    api_key_env: str | None = None
    base_url: str | None = None
    api_key: str | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self.id = str(self.id).strip()
        if not self.id:
            raise ValueError("Model id cannot be empty")

        self.provider = str(_enum_value(self.provider) or "unknown").lower()
        self.provider_account = (
            str(self.provider_account).strip() if self.provider_account else None
        )
        self.name = str(self.name or self.id)
        self.model = str(self.model or self.id)

        model_type = str(_enum_value(self.type) or "").lower()
        if model_type not in VALID_MODEL_TYPES:
            model_type = (
                ModelType.LOCAL.value
                if self.provider in LOCAL_PROVIDERS
                else ModelType.CLOUD.value
            )
        self.type = model_type

        if isinstance(self.capabilities, str):
            self.capabilities = [
                capability.strip().lower()
                for capability in self.capabilities.split(",")
                if capability.strip()
            ]
        else:
            self.capabilities = [str(item).lower() for item in self.capabilities or []]

        self.status = normalize_status(self.status)
        self.context_length = int(self.context_length or 0)
        if self.context_length < 0:
            raise ValueError("context_length cannot be negative")

    @property
    def provider_label(self) -> str:
        return PROVIDER_LABELS.get(self.provider, self.provider)

    @property
    def provider_name(self) -> str:
        return self.provider_label

    @property
    def type_name(self) -> str:
        return self.type.title()

    @property
    def model_type(self) -> str:
        return self.type

    @property
    def capabilities_text(self) -> str:
        return ", ".join(self.capabilities)

    @classmethod
    def from_provider_entry(cls, entry: ProviderEntry) -> ModelEntry:
        return entry.to_model_entry()

    @classmethod
    def from_dict(cls, data: dict) -> ModelEntry:
        if not isinstance(data, dict):
            raise TypeError("Model entry must be a mapping")

        raw = dict(data)
        model_id = raw.get("id") or raw.get("name") or raw.get("model")
        if model_id is None:
            raise ValueError("Model entry is missing id")

        raw_type = str(_enum_value(raw.get("type")) or "").lower()
        provider = str(_enum_value(raw.get("provider")) or "").lower()
        if not provider and raw_type not in VALID_MODEL_TYPES:
            provider = raw_type
        if raw_type not in VALID_MODEL_TYPES:
            raw_type = (
                ModelType.LOCAL.value
                if provider in LOCAL_PROVIDERS
                else ModelType.CLOUD.value
            )

        return cls(
            id=str(model_id),
            name=raw.get("name") or str(model_id),
            provider=provider or "unknown",
            provider_account=raw.get("provider_account") or raw.get("account"),
            model=raw.get("model") or raw.get("name") or str(model_id),
            type=raw_type or ModelType.CLOUD.value,
            capabilities=raw.get("capabilities") or [],
            status=raw.get("status", ModelStatus.UNKNOWN.value),
            context_length=raw.get("context_length", 0),
            api_key_ref=raw.get("api_key_ref"),
            api_key_env=raw.get("api_key_env"),
            base_url=raw.get("base_url"),
            api_key=raw.get("api_key"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "provider_account": self.provider_account,
            "model": self.model,
            "type": self.type,
            "capabilities": list(self.capabilities),
            "status": self.status,
            "context_length": self.context_length,
            "api_key_ref": self.api_key_ref,
            "api_key_env": self.api_key_env,
            "base_url": self.base_url,
        }
