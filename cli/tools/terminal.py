import subprocess

def run(command):
    return subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True
    )
