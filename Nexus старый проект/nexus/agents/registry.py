from .director import DirectorAgent
from .roles import ArchitectAgent, DesignerAgent, DeveloperAgent, QAAgent, ReviewerAgent

class AgentRegistry:
    def __init__(self, executor=None):
        self.agents={}
        self.register(DirectorAgent("Director", executor=executor))
        for role in (
            ArchitectAgent(),
            DesignerAgent(),
            DeveloperAgent(),
            QAAgent(),
            ReviewerAgent(),
        ):
            self.register(role)

    def register(self,agent):
        self.agents[agent.name]=agent

    def list(self):
        return list(self.agents.values())

    def get_default(self):
        return self.agents["Director"]
