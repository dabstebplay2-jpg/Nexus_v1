import torch
import torch.nn as nn
import torch.optim as optim


# Наш маленький мозг
class NexusBrain(nn.Module):
    def __init__(self):
        super().__init__()

        self.layer = nn.Linear(1, 1)

    def forward(self, x):
        return self.layer(x)


# создаем модель
model = NexusBrain()


# данные для обучения
x_train = torch.tensor([
    [1.0],
    [2.0],
    [3.0],
    [4.0],
    [5.0]
])

y_train = torch.tensor([
    [2.0],
    [4.0],
    [6.0],
    [8.0],
    [10.0]
])


# функция ошибки
loss_function = nn.MSELoss()


# алгоритм обучения
optimizer = optim.SGD(
    model.parameters(),
    lr=0.01
)


print("Начальные параметры:")
print(list(model.parameters()))


# обучение
for epoch in range(1000):

    prediction = model(x_train)

    loss = loss_function(
        prediction,
        y_train
    )

    optimizer.zero_grad()

    loss.backward()

    optimizer.step()


    if epoch % 100 == 0:
        print(
            f"Эпоха {epoch}, ошибка {loss.item()}"
        )


print("\nПосле обучения:")

test = torch.tensor([[7.0]])

result = model(test)

print(
    "7 должно быть примерно 14:",
    result.item()
)