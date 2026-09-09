class SemanticMemory:
    def __init__(self):
        self.records=[]

    def remember(self,data):
        self.records.append(data)

    def search(self,query):
        return self.records
