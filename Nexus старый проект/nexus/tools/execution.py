class ExecutionEngine:
    def __init__(self):
        self.history=[]

    def execute(self,tool,args):
        result={
            "tool":tool,
            "args":args,
            "status":"completed"
        }
        self.history.append(result)
        return result
