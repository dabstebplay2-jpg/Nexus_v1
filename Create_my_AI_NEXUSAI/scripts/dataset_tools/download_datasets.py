from datasets import load_dataset
from pathlib import Path
import json


OUTPUT = Path(
    "datasets/NexusAI_v0.1/raw/downloads/dolly.jsonl"
)



def download_dolly():


    print(
        "Downloading Dolly 15k..."
    )


    dataset = load_dataset(
        "databricks/databricks-dolly-15k",
        split="train"
    )


    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    with open(
        OUTPUT,
        "w",
        encoding="utf-8"
    ) as f:


        for item in dataset:


            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



    print(
        "Saved:",
        len(dataset),
        "examples"
    )



if __name__ == "__main__":

    download_dolly()

