import torch.nn as nn


class NexusWordContext8Model(nn.Module):

    def __init__(
        self,
        vocab_size,
        context_size=8
    ):

        super().__init__()


        self.context_size = context_size


        self.embedding = nn.Embedding(
            vocab_size,
            64
        )


        self.linear = nn.Linear(
            context_size * 64,
            vocab_size
        )



    def forward(self, x):

        x = self.embedding(x)


        x = x.reshape(
            x.shape[0],
            -1
        )


        return self.linear(x)