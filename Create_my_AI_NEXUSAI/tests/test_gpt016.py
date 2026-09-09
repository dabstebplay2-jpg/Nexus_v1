import torch

from model.gpt_model_v016 import NexusGPT016


model = NexusGPT016(
    vocab_size=56
)


x = torch.randint(
    0,
    56,
    (2,32)
)


out = model(x)


print("Вход:")
print(x.shape)


print("Выход:")
print(out.shape)


print("NexusGPT v0.016 работает!")
