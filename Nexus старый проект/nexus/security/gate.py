class ApprovalGate:
    def check(self,action):
        return {
            "required": action in [
                "delete",
                "system_change"
            ]
        }
