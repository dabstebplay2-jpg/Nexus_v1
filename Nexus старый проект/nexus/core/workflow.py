class WorkflowEngine:
    def __init__(self):
        self.history=[]

    async def execute(self,agents,task):
        results={}
        for name,agent in agents.items():
            results[name]=await agent.run(task)
        self.history.append(results)
        return results
