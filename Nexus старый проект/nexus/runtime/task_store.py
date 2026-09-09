class TaskStore:
    def __init__(self):
        self.tasks={}
    def save(self,task_id,data):
        self.tasks[task_id]=data
    def get(self,task_id):
        return self.tasks.get(task_id)
