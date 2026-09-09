class AgentBus:
    def __init__(self):
        self.messages=[]

    def publish(self, sender, message):
        self.messages.append({"sender":sender,"message":message})

    def history(self):
        return self.messages
