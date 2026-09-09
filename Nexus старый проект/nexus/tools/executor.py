class ToolExecutor:
    def __init__(self,registry):
        self.registry=registry

    def execute(self,name,**kwargs):
        tool=self.registry.get(name)
        if not tool:
            return None
        return tool.execute(**kwargs)
