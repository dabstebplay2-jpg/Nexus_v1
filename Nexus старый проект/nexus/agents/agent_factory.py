class AgentFactory:
    def create_agent(self, name, role):
        return {"name": name, "role": role, "status": "created"}
