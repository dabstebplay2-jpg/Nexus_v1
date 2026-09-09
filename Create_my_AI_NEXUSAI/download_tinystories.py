from datasets import load_dataset


print("Загрузка TinyStories...")


dataset = load_dataset(
    "roneneldan/TinyStories",
    split="train"
)


print(dataset)


texts = []


# берем первые 10000 историй
for item in dataset.select(range(10000)):

    texts.append(
        item["text"]
    )


with open(
    "data/tinystories.txt",
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "\n\n".join(texts)
    )


print("Готово!")
print(
    "Историй:",
    len(texts)
)
