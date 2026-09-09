class EventEngine:
    def __init__(self):
        self.events=[]
    def emit(self,event):
        self.events.append(event)
