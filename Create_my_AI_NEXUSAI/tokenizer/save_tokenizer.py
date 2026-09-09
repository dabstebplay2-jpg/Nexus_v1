import json


def save_tokenizer(tokenizer, path):

    data = {
        "word_to_id": tokenizer.word_to_id,
        "id_to_word": tokenizer.id_to_word
    }


    with open(
        path,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=4
        )


def load_tokenizer(path):

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        data = json.load(f)


    return data