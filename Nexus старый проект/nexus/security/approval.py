class ApprovalManager:
    def require(self,action):
        dangerous=["delete","system","credential"]
        return any(x in action.lower() for x in dangerous)
