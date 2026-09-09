from pathlib import Path

def list_files(path):
    return [str(x) for x in Path(path).rglob("*")]
