import torch
from torch.utils.data import Dataset


class BPEDataset(Dataset):


    def __init__(
        self,
        tokens,
        context_size
    ):

        self.tokens = tokens
        self.context_size = context_size



    def __len__(self):

        return len(
            self.tokens
        ) - self.context_size



    def __getitem__(
        self,
        index
    ):

        x = self.tokens[
            index:
            index+self.context_size
        ]


        y = self.tokens[
            index+1:
            index+self.context_size+1
        ]


        return (
            torch.tensor(x),
            torch.tensor(y)
        )
