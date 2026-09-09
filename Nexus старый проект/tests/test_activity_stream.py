from nexus.activity.api import ActivityAPI
from nexus.activity.events import ActivityType, AgentEvent
from nexus.activity.renderer import ActivityRenderer
from nexus.activity.stream import ActivityStream


def test_activity_stream_subscriptions_and_ui_snapshot():
    stream = ActivityStream()
    received = []
    unsubscribe = stream.subscribe(received.append)
    stream.publish(ActivityType.AGENT_STARTED, agent="Developer", target="App.tsx")
    stream.publish(ActivityType.FILE_WRITE, agent="Developer", target="App.tsx")
    stream.publish(ActivityType.COMPLETED, agent="Developer", status="completed")
    unsubscribe()

    snapshot = ActivityAPI(stream).snapshot()

    assert len(received) == 3
    assert snapshot["agents"] == [
        {
            "name": "Developer",
            "status": "completed",
            "last_event": "completed",
            "target": None,
        }
    ]
    assert snapshot["events"][1]["type"] == "file.write"


def test_activity_renderer_produces_professional_trace():
    events = [
        AgentEvent(ActivityType.PROJECT_ANALYZED, message="React + TypeScript найден"),
        AgentEvent(ActivityType.AGENT_STARTED, agent="Developer", data={"model": "local:qwen"}),
        AgentEvent(ActivityType.FILE_WRITE, agent="Developer", target="App.tsx"),
        AgentEvent(ActivityType.COMPLETED, agent="Nexus"),
    ]

    rendered = ActivityRenderer().render(events)

    assert rendered[0] == "✓ React + TypeScript найден"
    assert "Model: local:qwen" in rendered[1]
    assert "App.tsx" in rendered[2]
    assert rendered[-1] == "Completed ✓"
