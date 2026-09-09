class ToolRegistry:
    def __init__(self, activity=None):
        self.tools = {}
        self.activity = activity

    def register(self, name, tool):
        self.tools[name] = tool

    def get(self, name):
        return self.tools.get(name)

    def list(self):
        return list(self.tools.keys())

    def execute(self, name, **kwargs):
        tool = self.get(name)
        if tool is None:
            raise KeyError(f"Tool not found: {name}")
        execute = getattr(tool, "execute", None)
        if execute is None:
            raise TypeError(f"Tool does not implement execute(): {name}")
        result = execute(**kwargs)
        if self.activity is not None:
            from nexus.activity.events import ActivityType

            event_type = {
                "read_file": ActivityType.FILE_READ,
                "write_file": ActivityType.FILE_WRITE,
                "edit_file": ActivityType.FILE_WRITE,
                "run_command": ActivityType.COMMAND_RUN,
                "run_tests": ActivityType.TEST_RUN,
                "run_build": ActivityType.BUILD_RUN,
            }.get(name)
            if event_type is not None:
                self.activity.publish(
                    event_type,
                    agent="Developer" if name not in {"run_tests", "run_build"} else "QA",
                    target=str(kwargs.get("path") or kwargs.get("command") or ""),
                    data={"tool": name, "ok": result.get("ok", True) if isinstance(result, dict) else True},
                )
        return result
