class ProjectMemory:
    def __init__(self):
        self.projects={}

    def save(self, project, data):
        self.projects[project]=data

    def load(self, project):
        return self.projects.get(project)
