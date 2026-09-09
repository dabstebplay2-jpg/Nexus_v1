class PluginLoader:
    def __init__(self):
        self.plugins=[]

    def register(self, plugin):
        self.plugins.append(plugin)
