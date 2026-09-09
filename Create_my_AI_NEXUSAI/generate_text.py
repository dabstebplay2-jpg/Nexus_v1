import torch

from tokenizer.simple_tokenizer import SimpleTokenizer
from model.context_model import NexusContextModel


# ==========================
# Настройки генерации
# ==========================

context_size = 8

temperature = 0.8

top_k = 5


# ==========================
# Загружаем данные
# ==========================

with open(
    "data/text.txt",
    "r",
    encoding="utf-8"
) as f:
    text = f.read()


tokenizer = SimpleTokenizer(text)


vocab_size = len(tokenizer.char_to_id)


# ==========================
# Создаем модель
# ==========================

model = NexusContextModel(
    vocab_size,
    context_size
)


# ==========================
# Загружаем обученные веса
# ==========================

model.load_state_dict(
    torch.load(
        "model/nexus_context.pth",
        weights_only=True
    )
)


model.eval()


print("NexusAI загружена")
print("Размер словаря:", vocab_size)
print()


# ==========================
# Генерация текста
# ==========================

def generate(start, length=100):

    tokens = tokenizer.encode(start)


    print("Начало:")
    print(start)
    print()
    print("Генерация:")
    print(start, end="", flush=True)


    for _ in range(length):

        # берем последние символы

        context = tokens[-context_size:]


        # если текста мало - добавляем пустые места

        while len(context) < context_size:

            context.insert(
                0,
                0
            )


        x = torch.tensor(
            [context]
        )


        with torch.no_grad():

            output = model(x)


        # температура

        output = output / temperature


        # выбираем только самые вероятные варианты

        values, indices = torch.topk(
            output,
            top_k
        )


        probabilities = torch.softmax(
            values,
            dim=1
        )


        choice = torch.multinomial(
            probabilities,
            1
        )


        next_token = indices[
            0,
            choice
        ].item()


        tokens.append(
            next_token
        )


        print(
            tokenizer.decode(
                [next_token]
            ),
            end="",
            flush=True
        )


    print()
    print()


    return tokenizer.decode(tokens)



# ==========================
# Запуск
# ==========================

result = generate(
    "кот",
    100
)


print("Полный результат:")
print(result)