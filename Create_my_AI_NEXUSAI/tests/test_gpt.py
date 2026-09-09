import torch

from model.gpt_model import NexusGPT


model = NexusGPT(
    vocab_size=100
)


x = torch.randint(
    0,
    100,
    (2,32)
)


out = model(x)


print(x.shape)
print(out.shape)

print("NexusGPT работает!")
