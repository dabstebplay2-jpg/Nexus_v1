import json
import random
from pathlib import Path


ROOT = Path("datasets/NexusAI_v0.1")

PROCESSED = ROOT / "processed"

FINAL = ROOT / "final"


INPUT = PROCESSED / "train_clean.jsonl"


TRAIN = FINAL / "train.jsonl"
VAL = FINAL / "validation.jsonl"

STATS = FINAL / "statistics.json"


random.seed(42)



def load_jsonl(path):

    data = []

    with open(
        path,
        encoding="utf-8"
    ) as f:

        for line in f:

            try:

                data.append(
                    json.loads(line)
                )

            except:

                pass

    return data




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




def count_types(data):

    result = {}

    for item in data:

        t = item.get(
            "type",
            "unknown"
        )

        result[t] = result.get(
            t,
            0
        ) + 1


    return result




def main():

    print(
        "Rebuilding NexusDataset CLEAN..."
    )


    data = load_jsonl(
        INPUT
    )


    print(
        "Loaded:",
        len(data)
    )


    random.shuffle(
        data
    )


    split = int(
        len(data) * 0.95
    )


    train = data[:split]

    val = data[split:]


    save_jsonl(
        TRAIN,
        train
    )


    save_jsonl(
        VAL,
        val
    )


    stats = {

        "dataset":
        "NexusDataset v0.1 CLEAN",


        "total":
        len(data),


        "train":
        len(train),


        "validation":
        len(val),


        "train_categories":
        count_types(train),


        "validation_categories":
        count_types(val),


        "seed":
        42

    }


    FINAL.mkdir(
        parents=True,
        exist_ok=True
    )


    with open(
        STATS,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            stats,
            f,
            indent=4,
            ensure_ascii=False
        )


    print()
    print("DONE")
    print(
        json.dumps(
            stats,
            indent=4,
            ensure_ascii=False
        )
    )



if __name__ == "__main__":

    main()