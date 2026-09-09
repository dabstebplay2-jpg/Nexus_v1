class AgentLifecycle:
    states=["created","planning","executing","verifying","completed"]

    def transition(self,state):
        return state
