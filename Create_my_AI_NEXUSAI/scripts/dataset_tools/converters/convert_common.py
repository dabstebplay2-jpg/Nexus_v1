import json
from pathlib import Path



def save_jsonl(path, data):

    path = Path(path)

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    with open(
        path,
        "w",
        encoding="utf-8"
    ) as f:

        for item in data:

            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



def append_jsonl(path, data):

    path = Path(path)

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    with open(
        path,
        "a",
        encoding="utf-8"
    ) as f:

        for item in data:

            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



def clean_text(text):

    if text is None:

        return ""


    return (
        str(text)
        .strip()
        .replace("\x00", "")
    )



def make_id(prefix, index):

    return (
        f"{prefix}_{index:08d}"
    )



def valid_text(text):

    if not text:

        return False


    if len(text.strip()) < 5:

        return False


    return True



def count_tokens_approx(text):

    """
    Быстрая оценка:
    1 токен примерно 4 символа
    """

    if not text:

        return 0


    return len(text) // 4

