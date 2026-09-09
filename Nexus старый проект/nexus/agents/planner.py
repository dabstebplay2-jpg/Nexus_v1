class PlannerAgent:
    name="Planner"

    async def run(self,task):
        return {
            "plan":[
                "analyze",
                "design",
                "implement",
                "test"
            ]
        }
