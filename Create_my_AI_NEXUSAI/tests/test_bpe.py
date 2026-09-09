from tokenizers import Tokenizer


tokenizer = Tokenizer.from_file(
    "models/NexusAI_v0.017/tokenizer.json"
)


text = "Once upon a time there was a little girl"


tokens = tokenizer.encode(
    text
)


print("Текст:")
print(text)


print()


print("Токены:")
print(tokens.ids)


print()


print("Обратно:")
print(
    tokenizer.decode(
        tokens.ids
    )
)
