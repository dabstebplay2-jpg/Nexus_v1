from __future__ import annotations

from typing import Any, Generic, TypeVar

T = TypeVar("T")


class ComponentRegistry(Generic[T]):
    def __init__(self):
        self._items: dict[str, T] = {}

    def register(self, name: str, item: T) -> None:
        self._items[name] = item

    def get(self, name: str) -> T | None:
        return self._items.get(name)

    def list(self) -> list[T]:
        return list(self._items.values())

    def names(self) -> list[str]:
        return sorted(self._items.keys())

    def count(self) -> int:
        return len(self._items)
