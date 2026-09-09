class Agent:
    def __init__(self,name,role):
        self.name=name; self.role=role; self.state='READY'
    def execute(self,task):
        self.state='EXECUTING'
        return {'agent':self.name,'task':task,'status':'completed'}

class AgentSociety:
    def __init__(self):
        self.agents=[Agent(x,x) for x in ['Director','Architect','Planner','Researcher','Developer','Tester','Critic','Security','Repair']]
