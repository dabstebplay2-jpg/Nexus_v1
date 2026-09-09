class AgentManager:
    def __init__(self):
        self.agents={}

    def register(self,agent):
        self.agents[agent.name]=agent

    def list(self):
        return list(self.agents)
