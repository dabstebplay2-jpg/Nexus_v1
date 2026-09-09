class RuntimeExecutor:
    async def execute(self, task):
        return {
            "task": task,
            "state": "running"
        }
