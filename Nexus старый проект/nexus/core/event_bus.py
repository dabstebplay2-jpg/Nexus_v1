from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Awaitable, Callable

from nexus.core.event_types import EventType

EventHandler = Callable[[dict], Awaitable[None] | None]


class EventBus:
    def __init__(self):
        self.events: list[dict] = []
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    async def emit(self, name: str | EventType, payload: dict | None = None) -> dict:
        event_name = name.value if isinstance(name, EventType) else name
        event = {
            "name": event_name,
            "time": datetime.now(timezone.utc).isoformat(),
            "payload": payload or {},
        }
        self.events.append(event)

        for handler in self._handlers.get(event_name, []):
            result = handler(event)
            if result is not None:
                await result
        for handler in self._handlers.get("*", []):
            result = handler(event)
            if result is not None:
                await result

        return event

    def on(self, name: str | EventType, handler: EventHandler) -> None:
        event_name = name.value if isinstance(name, EventType) else name
        self._handlers[event_name].append(handler)

    def history(self, limit: int | None = None, name: str | EventType | None = None) -> list[dict]:
        items = self.events
        if name is not None:
            event_name = name.value if isinstance(name, EventType) else name
            items = [event for event in items if event["name"] == event_name]
        if limit is None:
            return list(items)
        return items[-limit:]

    def count(self, name: str | EventType | None = None) -> int:
        if name is None:
            return len(self.events)
        event_name = name.value if isinstance(name, EventType) else name
        return sum(1 for event in self.events if event["name"] == event_name)

    def clear(self) -> None:
        self.events.clear()
