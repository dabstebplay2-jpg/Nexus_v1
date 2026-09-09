from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import Whitespace


class NexusBPETokenizer:


    def __init__(self):

        self.tokenizer = Tokenizer(
            BPE(
                unk_token="<UNK>"
            )
        )


        self.tokenizer.pre_tokenizer = Whitespace()



    def train(
        self,
        file
    ):


        trainer = BpeTrainer(
            vocab_size=5000,
            special_tokens=[
                "<PAD>",
                "<UNK>",
                "<BOS>",
                "<EOS>"
            ]
        )


        self.tokenizer.train(
            [
                file
            ],
            trainer
        )



    def encode(
        self,
        text
    ):

        return self.tokenizer.encode(
            text
        ).ids



    def decode(
        self,
        ids
    ):

        return self.tokenizer.decode(
            ids
        )



    def save(
        self,
        path
    ):

        self.tokenizer.save(
            path
        )


