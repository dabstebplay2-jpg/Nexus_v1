class ContextMemory:
    def __init__(self):
        self.context=[]

    def add(self,item):
        self.context.append(item)

    def retrieve(self):
        return self.context
