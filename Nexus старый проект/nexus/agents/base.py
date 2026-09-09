from abc import ABC,abstractmethod
import uuid

class BaseAgent(ABC):
    def __init__(self,name):
        self.id=str(uuid.uuid4())
        self.name=name
        self.state="READY"

    async def plan(self,task):
        task.steps.append("planned")
        return task

    async def verify(self,result):
        return True

    @abstractmethod
    async def execute(self,task):
        pass
