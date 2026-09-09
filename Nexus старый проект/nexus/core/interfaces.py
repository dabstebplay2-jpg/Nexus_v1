class AgentInterface:
    version="1.0"
    async def run(self, task):
        raise NotImplementedError
