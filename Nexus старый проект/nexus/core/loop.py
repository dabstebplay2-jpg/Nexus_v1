class AgentLoop:
    def __init__(self, agent, model=None, tools=None):
        self.agent=agent
        self.model=model
        self.tools=tools or []

    async def run(self, task):
        plan = await self.agent.plan(task)

        if self.model:
            response = await self.model.generate(plan)
        else:
            response = {"type":"local_plan","plan":plan}

        verified = await self.agent.verify(response)

        return {
            "plan": plan,
            "response": response,
            "verified": verified
        }
