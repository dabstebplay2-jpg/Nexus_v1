from nexus.core.runtime import NexusRuntime


class NexusCore:
    """Backward-compatible wrapper around NexusRuntime."""

    def __init__(self, runtime: NexusRuntime | None = None):
        self._runtime = runtime or NexusRuntime()
        self.events = self._runtime.events
        self.tasks = self._runtime.tasks
        self.agents = self._runtime.agents

    async def run(self, text):
        return await self._runtime.run_task(text)
