import warnings

warnings.warn(
    "nexus.kernel.event_bus.EventBus is deprecated; use nexus.core.event_bus.EventBus",
    DeprecationWarning,
    stacklevel=2,
)


class EventBus:
    def __init__(self):
        self.events = []

    def emit(self, event):
        self.events.append(event)
