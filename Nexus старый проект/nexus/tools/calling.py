class ToolCallingEngine:
    def call(self,name,args):
        return {"tool":name,"args":args,"status":"executed"}
