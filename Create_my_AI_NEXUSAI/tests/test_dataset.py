from tokenizer.gpt_tokenizer import GPTTokenizer
from dataset import GPTDataset


text = open(
    "data/text.txt",
    encoding="utf-8"
).read()


tokenizer = GPTTokenizer(text)


tokens = tokenizer.encode(text)


dataset = GPTDataset(
    tokens,
    context_size=8
)


x,y = dataset[0]


print("Вход:")
print(x)


print("Ответ:")
print(y)


print("Размер:")
print(len(dataset))
