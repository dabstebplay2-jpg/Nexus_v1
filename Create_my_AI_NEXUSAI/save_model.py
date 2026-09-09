import json
import torch

from tokenizer.word_tokenizer import WordTokenizer


# Загружаем текст

with open(
    "data/text.txt",
    "r",
    encoding="utf-8"
) as f:
    text = f.read()


# Создаем токенизатор

tokenizer = WordTokenizer(text)


# Сохраняем словарь

tokenizer_data = {

    "word_to_id":
        tokenizer.word_to_id,

    "id_to_word":
        tokenizer.id_to_word
}


with open(
    "models/NexusAI_v0.009/tokenizer.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        tokenizer_data,
        f,
        ensure_ascii=False,
        indent=4
    )


# Конфигурация модели

config = {

    "name": "NexusAI",

    "version": "0.009",

    "type": "WordContextModel",

    "vocab_size":
        len(tokenizer.word_to_id),

    "context_size": 2,

    "embedding_size": 64

}


with open(
    "models/NexusAI_v0.009/config.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        config,
        f,
        ensure_ascii=False,
        indent=4
    )


print(
    "Токенизатор сохранен!"
)

print(
    "Конфигурация сохранена!"
)