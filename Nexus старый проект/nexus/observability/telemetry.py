class Telemetry:
    def record(self, event):
        return {
            "event": event,
            "recorded": True
        }
