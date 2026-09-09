
from pathlib import Path
import json


FILE = Path(".nexus/model_database.json")


def save(data):

    FILE.parent.mkdir(
        exist_ok=True
    )

    FILE.write_text(
        json.dumps(
            data,
            indent=2,
            ensure_ascii=False
        ),
        encoding="utf-8"
    )


def load():

    if not FILE.exists():
        return []

    try:
        return json.loads(
            FILE.read_text(
                encoding="utf-8"
            )
        )

    except:

        return []
