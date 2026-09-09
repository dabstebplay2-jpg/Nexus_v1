import torch
import torch.nn as nn


class NexusLanguageModel(nn.Module):

    def __init__(self, vocab_size):
        super().__init__()

        self.embedding = nn.Embedding(
            vocab_size,
            32
        )

        self.linear = nn.Linear(
            32,
            vocab_size
        )


    def forward(self, x):

        x = self.embedding(x)

        x = x.mean(dim=1)

        logits = self.linear(x)

        return logits