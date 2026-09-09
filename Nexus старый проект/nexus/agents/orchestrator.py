class Orchestrator:
    async def run(self,task):
        return {"task":task,"mode":"orchestrated"}
