class AIRuntime:
    def __init__(self, providers=None):
        self.providers = providers or []

    async def generate(self, prompt):
        return {
            "prompt": prompt,
            "status": "generated"
        }
