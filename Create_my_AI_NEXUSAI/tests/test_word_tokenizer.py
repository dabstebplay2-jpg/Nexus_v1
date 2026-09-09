from tokenizer.word_tokenizer import WordTokenizer


with open(
    "data/text.txt",
    "r",
    encoding="utf-8"
) as f:
    text = f.read()


tokenizer = WordTokenizer(text)


sentence = "кот любит молоко"


encoded = tokenizer.encode(sentence)


print("Текст:")
print(sentence)

print()

print("Токены:")
print(encoded)

print()

print("Обратно:")
print(
    tokenizer.decode(encoded)
)