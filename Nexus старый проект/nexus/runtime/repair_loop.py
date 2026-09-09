class RepairLoop:
    async def fix(self,error):
        return {
            "error":error,
            "action":"repair_attempt"
        }
