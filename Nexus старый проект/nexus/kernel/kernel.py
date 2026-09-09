from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class NexusKernel:
    state: str = "ONLINE"
    services: dict = field(default_factory=dict)

    def register(self, name, service):
        self.services[name]=service

    def status(self):
        return {"state": self.state, "services": list(self.services)}
