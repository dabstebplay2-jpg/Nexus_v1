import torch
import torch.nn as nn


class NexusTransformer(nn.Module):

    def __init__(
        self,
        vocab_size,
        context_size=32,
        embedding_size=128,
        heads=4,
        layers=2
    ):

        super().__init__()


        self.context_size = context_size


        self.embedding = nn.Embedding(
            vocab_size,
            embedding_size
        )


        self.position = nn.Embedding(
            context_size,
            embedding_size
        )


        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embedding_size,
            nhead=heads,
            dim_feedforward=512,
            batch_first=True
        )


        self.transformer = nn.TransformerEncoder(
            encoder_layer,
            num_layers=layers
        )


        self.output = nn.Linear(
            embedding_size,
            vocab_size
        )



    def forward(self, x):

        batch, seq = x.shape


        positions = torch.arange(
            seq,
            device=x.device
        )


        token_embedding = self.embedding(x)


        position_embedding = self.position(
            positions
        )


        x = token_embedding + position_embedding


        x = self.transformer(
            x
        )


        x = x[:, -1, :]


        return self.output(x)
