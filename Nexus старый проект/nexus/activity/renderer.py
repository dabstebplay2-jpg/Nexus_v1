"""Human-friendly rendering for activity events."""

from __future__ import annotations

from nexus.activity.events import ActivityType, AgentEvent


class ActivityRenderer:
    def render(self, events: list[AgentEvent | dict]) -> list[str]:
        return [self.render_event(self._event(item)) for item in events]

    @staticmethod
    def _event(item: AgentEvent | dict) -> AgentEvent:
        if isinstance(item, AgentEvent):
            return item
        fields = {key: value for key, value in item.items() if key in {"type", "agent", "target", "status", "message", "data", "id", "time"}}
        return AgentEvent(**fields)

    def render_event(self, event: AgentEvent) -> str:
        event_type = event.type
        if event_type == ActivityType.PROJECT_ANALYSIS_STARTED.value:
            return "● Nexus Director анализирует проект"
        if event_type == ActivityType.PROJECT_ANALYZED.value:
            return f"✓ {event.message or 'Проект проанализирован'}"
        if event_type == ActivityType.DIRECTOR_STARTED.value:
            return "● Nexus Director анализирует задачу"
        if event_type == ActivityType.DIRECTOR_PLANNING.value:
            return "◌ Изучаю проект и создаю план..."
        if event_type == ActivityType.TEAM_CREATED.value:
            roles = ", ".join(str(role).title() for role in event.data.get("roles", []))
            return f"Создана команда: {roles}"
        if event_type == ActivityType.AGENT_STARTED.value:
            model = event.data.get("model")
            suffix = f"\n  Model: {model}" if model else ""
            return f"● Agent started: {event.agent}{suffix}"
        if event_type == ActivityType.AGENT_THINKING.value:
            return f"◌ Generating: {event.agent} анализирует контекст"
        if event_type == ActivityType.FILE_READ.value:
            return f"◌ {event.agent}: читает {event.target}"
        if event_type == ActivityType.FILE_WRITE.value:
            return f"✓ Tool: write_file — {event.target}"
        if event_type == ActivityType.COMMAND_RUN.value:
            return f"◌ {event.agent}: запускает команду {event.target or ''}".rstrip()
        if event_type == ActivityType.TEST_RUN.value:
            return f"◌ {event.agent}: запускает тесты"
        if event_type == ActivityType.BUILD_RUN.value:
            return f"◌ {event.agent}: запускает build"
        if event_type == ActivityType.VERIFICATION_STARTED.value:
            return f"✓ Verifier: {event.status.upper()}"
        if event_type == ActivityType.REPAIR_STARTED.value:
            return "◌ Director: запускает repair loop"
        if event_type == ActivityType.FAILED.value:
            return f"✗ {event.message or 'Ошибка'}"
        if event_type == ActivityType.COMPLETED.value:
            return "Completed ✓"
        return event.message or event.type


__all__ = ["ActivityRenderer"]
