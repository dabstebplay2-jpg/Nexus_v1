"""Read-only activity state API for future UI clients."""

from __future__ import annotations

from nexus.activity.stream import ActivityStream


class ActivityAPI:
    def __init__(self, stream: ActivityStream):
        self.stream = stream

    def snapshot(self, event_limit: int = 100) -> dict:
        return {
            "agents": self.stream.agent_states(),
            "events": [event.to_dict() for event in self.stream.history(limit=event_limit)],
        }

    def events(self, since: int = 0) -> list[dict]:
        return [event.to_dict() for event in self.stream.history(since=since)]


__all__ = ["ActivityAPI"]
