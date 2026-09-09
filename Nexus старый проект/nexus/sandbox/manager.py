class SandboxManager:
    def __init__(self):
        self.active=True

    def execute(self, action):
        return {"sandbox":"ok","action":action}
