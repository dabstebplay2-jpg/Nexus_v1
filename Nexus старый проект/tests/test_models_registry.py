import pytest

from nexus.models.registry import ModelRegistry
from nexus.models.types import ModelEntry, ModelStatus


def _entry(model_id: str = "gpt5") -> ModelEntry:
    return ModelEntry(
        id=model_id,
        name=model_id.upper(),
        provider="openai",
        model="gpt-5",
        type="cloud",
        capabilities=["coding", "reasoning"],
    )


def test_registry_contract():
    registry = ModelRegistry()
    first = registry.add(_entry("a"))
    second = registry.register(_entry("b"))

    assert registry.count() == 2
    assert registry.ids() == ["a", "b"]
    assert registry.get("a") is first
    assert registry.list() == registry.all() == [first, second]

    updated = registry.update("a", name="Updated", context_length=32000)
    assert updated is not None
    assert updated.name == "Updated"
    assert updated.context_length == 32000

    registry.set_status("a", ModelStatus.CONNECTED)
    assert registry.get("a").status == "online"
    registry.set_status("a", "OFFLINE")
    assert registry.get("a").status == "offline"

    assert registry.remove("b") is True
    assert registry.remove("missing") is False
    registry.clear()
    assert registry.count() == 0


def test_registry_rejects_dict_models():
    registry = ModelRegistry()
    with pytest.raises(TypeError, match="only ModelEntry"):
        registry.add({"id": "dict-model"})


def test_registry_rejects_duplicates():
    registry = ModelRegistry([_entry("same")])
    with pytest.raises(ValueError, match="already exists"):
        registry.register(_entry("same"))
