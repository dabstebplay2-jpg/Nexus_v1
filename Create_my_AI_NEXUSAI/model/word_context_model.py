import torch
import torch.nn as nn


class NexusWordContextModel(nn.Module):

    def __init__(
        self,
        vocab_size,
        context_size=2
    ):
        super().__init__()


        self.embedding = nn.Embedding(
            vocab_size,
            64
        )


        self.linear = nn.Linear(
            context_size * 64,
            vocab_size
        )


        self.context_size = context_size



    def forward(self, x):

        x = self.embedding(x)


        x = x.reshape(
            x.shape[0],
            -1
        )


        return self.linear(x)