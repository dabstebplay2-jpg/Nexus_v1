class ProjectBuilder:
    def create(self, specification):
        return {
            "project": specification,
            "status": "created"
        }
