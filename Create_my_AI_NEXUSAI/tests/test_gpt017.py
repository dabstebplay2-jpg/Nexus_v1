import torch

from model.nexus_gpt017 import NexusGPT017


model = NexusGPT017(
    vocab_size=5000
)


x = torch.randint(
    0,
    5000,
    (2,128)
)


out = model(x)


print("Вход:")
print(x.shape)


print("Выход:")
print(out.shape)


print("NexusGPT v0.017 работает!")
