"""Observable in-memory activity stream."""

from __future__ import annotations

from collections import defaultdict
from typing import Callable

from nexus.activity.events import ActivityType, AgentEvent


Subscriber = Callable[[AgentEvent], None]


class ActivityStream:
    def __init__(self):
        self._events: list[AgentEvent] = []
        self._subscribers: list[Subscriber] = []

    def publish(self, event: AgentEvent | str, **kwargs) -> AgentEvent:
        item = event if isinstance(event, AgentEvent) else AgentEvent(type=event, **kwargs)
        self._events.append(item)
        for subscriber in list(self._subscribers):
            subscriber(item)
        return item

    def subscribe(self, subscriber: Subscriber) -> Callable[[], None]:
        self._subscribers.append(subscriber)

        def unsubscribe() -> None:
            if subscriber in self._subscribers:
                self._subscribers.remove(subscriber)

        return unsubscribe

    def history(self, limit: int | None = None, since: int = 0) -> list[AgentEvent]:
        items = self._events[max(0, since):]
        return items if limit is None else items[-limit:]

    def count(self) -> int:
        return len(self._events)

    def clear(self) -> None:
        self._events.clear()

    def agent_states(self) -> list[dict]:
        states: dict[str, dict] = {}
        terminal = {ActivityType.COMPLETED.value, ActivityType.FAILED.value}
        for event in self._events:
            if event.agent == "Nexus":
                continue
            state = states.setdefault(
                event.agent,
                {"name": event.agent, "status": "idle", "last_event": None, "target": None},
            )
            state["last_event"] = event.type
            state["target"] = event.target
            if event.type == ActivityType.AGENT_STARTED.value:
                state["status"] = "working"
            elif event.type in terminal:
                state["status"] = "completed" if event.type.endswith("completed") else "failed"
        return list(states.values())

    def handle_orchestra_event(self, name: str, payload: dict) -> None:
        if name == "planning_started":
            self.publish(ActivityType.DIRECTOR_STARTED, agent="Director", message="Анализирует задачу")
            self.publish(ActivityType.DIRECTOR_PLANNING, agent="Director", message="Строит план команды")
        elif name == "team_created":
            self.publish(
                ActivityType.TEAM_CREATED,
                agent="Director",
                message="Команда создана",
                data={"roles": list(payload.get("roles", []))},
            )
        elif name == "worker_started":
            unit = payload.get("unit")
            agent = getattr(unit, "role", "Worker").title()
            self.publish(
                ActivityType.AGENT_STARTED,
                agent=agent,
                message=getattr(unit, "objective", None),
                data={"model": getattr(unit, "assigned_model", None)},
            )
            self.publish(ActivityType.AGENT_THINKING, agent=agent, message="Анализирует контекст")
        elif name == "worker_finished":
            unit = payload.get("unit")
            agent = getattr(unit, "role", "Worker").title()
            result = payload.get("result") or {}
            failed = isinstance(result, dict) and str(result.get("status", "completed")).lower() == "failed"
            self.publish(
                ActivityType.FAILED if failed else ActivityType.COMPLETED,
                agent=agent,
                status="failed" if failed else "completed",
                message="Ошибка" if failed else "Работа завершена",
            )
        elif name == "verification":
            result = payload.get("result")
            self.publish(
                ActivityType.VERIFICATION_STARTED,
                agent="Verifier",
                status=getattr(result, "status", "checking").lower(),
                message="Проверяет результат",
            )
        elif name == "repair_created":
            unit = payload.get("unit")
            self.publish(
                ActivityType.REPAIR_STARTED,
                agent="Director",
                message=getattr(unit, "objective", "Создана задача ремонта"),
            )
        elif name == "completed":
            self.publish(ActivityType.COMPLETED, agent="Nexus", status="completed", message="Готово")


__all__ = ["ActivityStream"]
