import json
from pathlib import Path

from datasets import load_dataset


ROOT = Path(
    "datasets/NexusAI_v0.1/raw"
)


def save_jsonl(path, data):

    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        path,
        "w",
        encoding="utf-8"
    ) as f:

        for item in data:

            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



def download_openassistant():

    print(
        "Downloading OpenAssistant..."
    )


    dataset = load_dataset(
        "OpenAssistant/oasst1",
        split="train"
    )


    output = ROOT / "chat/openassistant.jsonl"


    result = []


    for item in dataset:

        if (
            item.get("text")
            and item.get("lang") == "en"
        ):

            result.append(

                {
                    "id":
                    f"oasst_{len(result)}",

                    "type":
                    "chat",

                    "messages":
                    [
                        {
                            "role":
                            "user",

                            "content":
                            item.get(
                                "parent_id",
                                ""
                            )
                        },

                        {
                            "role":
                            "assistant",

                            "content":
                            item["text"]
                        }
                    ]
                }

            )


    save_jsonl(
        output,
        result
    )


    print(
        "OpenAssistant:",
        len(result)
    )




def download_codealpaca():

    print(
        "Downloading CodeAlpaca..."
    )


    dataset = load_dataset(
        "sahil2801/CodeAlpaca-20k",
        split="train"
    )


    output = ROOT / "code/codealpaca.jsonl"


    result = []


    for item in dataset:


        result.append(

            {
                "id":
                f"codealpaca_{len(result)}",

                "type":
                "code",

                "language":
                "python",

                "instruction":
                item.get(
                    "instruction",
                    ""
                ),

                "input":
                item.get(
                    "input",
                    ""
                ),

                "output":
                item.get(
                    "output",
                    ""
                )

            }

        )


    save_jsonl(
        output,
        result
    )


    print(
        "CodeAlpaca:",
        len(result)
    )




def download_gsm8k():

    print(
        "Downloading GSM8K..."
    )


    dataset = load_dataset(
        "openai/gsm8k",
        "main",
        split="train"
    )


    output = ROOT / "reasoning/gsm8k.jsonl"


    result = []


    for item in dataset:


        result.append(

            {
                "id":
                f"gsm8k_{len(result)}",

                "type":
                "reasoning",

                "problem":
                item["question"],

                "answer":
                item["answer"]

            }

        )


    save_jsonl(
        output,
        result
    )


    print(
        "GSM8K:",
        len(result)
    )




def main():

    print(
        "Downloading NexusAI v0.2 sources..."
    )


    download_openassistant()

    download_codealpaca()

    download_gsm8k()


    print(
        "ALL DONE"
    )



if __name__ == "__main__":

    main()