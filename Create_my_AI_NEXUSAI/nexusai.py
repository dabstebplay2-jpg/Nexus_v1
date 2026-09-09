import json
import torch

from model.word_context_model import NexusWordContextModel
from model.word_context8_model import NexusWordContext8Model



class NexusAI:


    def __init__(
        self,
        model,
        tokenizer,
        config
    ):

        self.model = model
        self.tokenizer = tokenizer
        self.config = config



    @staticmethod
    def load(path):

        # config

        with open(
            path + "/config.json",
            "r",
            encoding="utf-8-sig"
        ) as f:

            config = json.load(f)



        # tokenizer

        with open(
            path + "/tokenizer.json",
            "r",
            encoding="utf-8"
        ) as f:

            tokenizer = json.load(f)



        # выбор архитектуры

        if config["type"] == "WordContextModel":

            model = NexusWordContextModel(
                config["vocab_size"],
                config["context_size"]
            )


        elif config["type"] == "WordContext8Model":

            model = NexusWordContext8Model(
                config["vocab_size"],
                config["context_size"]
            )


        else:

            raise Exception(
                "Неизвестный тип модели: "
                + config["type"]
            )



        # веса

        model.load_state_dict(
            torch.load(
                config["weights"],
                weights_only=True
            )
        )


        model.eval()



        return NexusAI(
            model,
            tokenizer,
            config
        )