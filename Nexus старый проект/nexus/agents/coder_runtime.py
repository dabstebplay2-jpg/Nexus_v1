class CoderRuntime:
    async def generate(self,task):
        return {
            "task":task,
            "files":[],
            "status":"generated"
        }
