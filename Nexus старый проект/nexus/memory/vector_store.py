class VectorMemory:
    def __init__(self):
        self.items=[]

    def store(self,text,embedding=None):
        self.items.append({
            "text":text,
            "embedding":embedding
        })

    def search(self,query):
        return self.items
