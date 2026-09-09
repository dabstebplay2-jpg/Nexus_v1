import asyncio

from nexus.core.event_bus import EventBus
from nexus.core.event_types import EventType


def test_emit_stores_event():
    bus = EventBus()
    event = asyncio.run(bus.emit(EventType.TASK_CREATED, {"task_id": "t1"}))
    assert event["name"] == "task.created"
    assert event["payload"]["task_id"] == "t1"
    assert len(bus.history()) == 1


def test_emit_with_string_name():
    bus = EventBus()
    asyncio.run(bus.emit("custom.event", {"key": "value"}))
    assert bus.history()[0]["name"] == "custom.event"


def test_history_filter_by_name():
    bus = EventBus()
    asyncio.run(bus.emit(EventType.AGENT_STARTED, {"agent": "Director"}))
    asyncio.run(bus.emit(EventType.TOOL_EXECUTED, {"tool": "shell"}))
    asyncio.run(bus.emit(EventType.AGENT_FINISHED, {"agent": "Director"}))

    started = bus.history(name=EventType.AGENT_STARTED)
    assert len(started) == 1
    assert started[0]["payload"]["agent"] == "Director"


def test_handler_called():
    bus = EventBus()
    received = []

    async def handler(event):
        received.append(event)

    bus.on(EventType.MEMORY_UPDATED, handler)
    asyncio.run(bus.emit(EventType.MEMORY_UPDATED, {"scope": "short"}))
    assert len(received) == 1


def test_event_type_values():
    assert EventType.AGENT_STARTED.value == "agent.started"
    assert EventType.ERROR_OCCURRED.value == "error.occurred"
