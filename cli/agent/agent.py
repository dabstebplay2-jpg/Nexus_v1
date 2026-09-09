from agent.router import Router
from agent.planner import Planner


class Agent:

    def __init__(self, memory):
        self.router = Router()
        self.planner = Planner()
        self.memory = memory

    def run(self, task):
        mode = self.router.route(task)
        plan = self.planner.make(task)

        self.memory.add(task)

        return {
            "mode": mode,
            "plan": plan,
            "status": "ready for model backend"
        }
