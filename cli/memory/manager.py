import json
from pathlib import Path


class Memory:

    def __init__(self):
        self.file=Path("memory/history.json")
        self.file.parent.mkdir(exist_ok=True)

        if not self.file.exists():
            self.file.write_text("[]", encoding="utf8")

    def add(self, text):
        data=json.loads(self.file.read_text(encoding="utf8"))
        data.append(text)
        self.file.write_text(
            json.dumps(data,ensure_ascii=False,indent=2),
            encoding="utf8"
        )

    def show(self):
        return self.file.read_text(encoding="utf8")
