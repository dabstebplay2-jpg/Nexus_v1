class AutonomousRuntime:
    def __init__(self, director, agents, tools):
        self.director=director
        self.agents=agents
        self.tools=tools

    async def execute(self, task):
        decision = await self.director.run(task)
        return {
            "decision": decision,
            "agents": list(self.agents.keys()),
            "status": "executing"
        }
