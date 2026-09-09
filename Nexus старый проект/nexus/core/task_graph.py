class TaskGraph:
    def __init__(self):
        self.nodes=[]

    def add(self,name):
        self.nodes.append({
            "name":name,
            "status":"pending"
        })

    def run_order(self):
        return self.nodes
