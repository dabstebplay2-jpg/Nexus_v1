from tokenizer.simple_tokenizer import SimpleTokenizer


with open("data/text.txt", "r", encoding="utf-8") as f:
    text = f.read()


tokenizer = SimpleTokenizer(text)


encoded = tokenizer.encode("кот")


print("Текст:")
print("кот")


print("Числа:")
print(encoded)


print("Обратно:")
print(tokenizer.decode(encoded))