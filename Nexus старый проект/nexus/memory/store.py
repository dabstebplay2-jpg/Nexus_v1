class MemoryStore:
    def __init__(self):
        self.items=[]

    def save(self,item):
        self.items.append(item)

    def retrieve(self):
        return self.items
