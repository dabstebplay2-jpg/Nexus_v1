class ReleaseGate:
    def check(self):
        return {
            "tests": True,
            "ready": True
        }
