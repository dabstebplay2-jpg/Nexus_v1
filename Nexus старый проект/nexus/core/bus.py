class AgentBus:
    def __init__(self):
        self.messages=[]

    async def send(self,message):
        self.messages.append(message)

    def history(self):
        return self.messages
