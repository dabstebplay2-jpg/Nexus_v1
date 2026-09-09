import torch
import torch.nn as nn


class NexusWordModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()

        self.embedding = nn.Embedding(
            vocab_size,
            64
        )

        self.linear = nn.Linear(
            64,
            vocab_size
        )


    def forward(self, x):

        x = self.embedding(x)

        x = x.mean(dim=1)

        return self.linear(x)