class AuditLog:
    def __init__(self):
        self.records=[]

    def add(self,event):
        self.records.append(event)

    def list(self):
        return self.records
