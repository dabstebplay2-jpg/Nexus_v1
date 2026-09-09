class AgentFactory:
    def create(self, specification):
        return {"agent": specification, "status": "created"}
