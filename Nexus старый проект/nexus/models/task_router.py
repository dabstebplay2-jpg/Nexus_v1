# LEGACY - deprecated. This routes agent roles, not ModelEntry instances.


class TaskRouter:
    def choose(self, task):
        text=str(task).lower()
        if "код" in text or "code" in text:
            return "coder"
        if "исслед" in text:
            return "researcher"
        return "general"
