import subprocess

class ShellTool:
    name="shell"

    def execute(self,command):
        return subprocess.run(command,shell=True,capture_output=True,text=True).stdout
