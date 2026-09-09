import uuid

class TaskManager:
    def __init__(self):
        self.tasks=[]

    def create(self,input):
        task={
            "id":str(uuid.uuid4()),
            "status":"CREATED",
            "input":input,
            "steps":[]
        }
        self.tasks.append(task)
        return task
