import os
import json
from pathlib import Path


ROOT = Path(
    "datasets/NexusAI_v0.1"
)


RAW = ROOT / "raw"
PROCESSED = ROOT / "processed"
FINAL = ROOT / "final"
META = ROOT / "metadata"



def create_structure():

    folders = [
        RAW / "chat",
        RAW / "instruction",
        RAW / "code",
        RAW / "reasoning",
        RAW / "tools",

        PROCESSED,
        FINAL,
        META
    ]


    for folder in folders:
        folder.mkdir(
            parents=True,
            exist_ok=True
        )



def create_metadata():

    data = {

        "name":
        "NexusAI Dataset v0.1",

        "version":
        "0.1",

        "categories":
        [
            "chat",
            "instruction",
            "code",
            "reasoning",
            "tools"
        ],

        "target":
        "NexusAI assistant model"

    }


    with open(
        META / "dataset_info.json",
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            indent=4,
            ensure_ascii=False
        )



if __name__ == "__main__":

    print(
        "Creating NexusDataset v0.1..."
    )


    create_structure()

    create_metadata()


    print(
        "Done!"
    )
