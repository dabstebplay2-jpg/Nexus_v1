from dataclasses import dataclass
@dataclass
class Task:
    prompt:str
    status:str='CREATED'
class TaskEngine:
    def __init__(self): self.tasks=[]
    def create(self,prompt):
        t=Task(prompt); self.tasks.append(t); return t
