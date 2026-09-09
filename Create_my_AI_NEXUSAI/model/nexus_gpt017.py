import torch
import torch.nn as nn


class NexusGPT017(nn.Module):


    def __init__(
        self,
        vocab_size,
        context_size=128,
        embedding_size=256,
        heads=8,
        layers=4
    ):

        super().__init__()


        self.context_size = context_size


        self.token_embedding = nn.Embedding(
            vocab_size,
            embedding_size
        )


        self.position_embedding = nn.Embedding(
            context_size,
            embedding_size
        )


        block = nn.TransformerEncoderLayer(
            d_model=embedding_size,
            nhead=heads,
            dim_feedforward=1024,
            batch_first=True
        )


        self.transformer = nn.TransformerEncoder(
            block,
            num_layers=layers
        )


        self.output = nn.Linear(
            embedding_size,
            vocab_size
        )



    def forward(
        self,
        x
    ):


        batch, seq = x.shape


        positions = torch.arange(
            seq,
            device=x.device
        )


        x = (
            self.token_embedding(x)
            +
            self.position_embedding(positions)
        )


        mask = torch.triu(
            torch.ones(
                seq,
                seq,
                device=x.device
            ),
            diagonal=1
        )


        mask = mask.masked_fill(
            mask == 1,
            float("-inf")
        )


        x = self.transformer(
            x,
            mask
        )


        return self.output(x)
