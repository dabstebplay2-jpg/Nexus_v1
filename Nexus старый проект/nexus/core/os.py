class NexusOS:
    def __init__(self):
        self.modules=["core","agents","memory","tools","security","plugins","mcp"]
    def status(self):
        return self.modules
