class PermissionManager:
    def check(self, action):
        dangerous=[
            "delete",
            "format",
            "shutdown"
        ]
        return not any(x in action for x in dangerous)
