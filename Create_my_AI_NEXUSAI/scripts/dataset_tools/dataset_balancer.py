import json
import random
from pathlib import Path


ROOT = Path(
    "datasets/NexusAI_v0.1"
)

RAW = ROOT / "raw"

OUTPUT = ROOT / "processed" / "balanced_dataset.jsonl"

STATS = ROOT / "processed" / "balance_stats.json"


random.seed(42)



TARGET_RATIO = {

    "instruction": 0.40,

    "chat": 0.25,

    "code": 0.20,

    "reasoning": 0.10,

    "tools": 0.05

}




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




def detect_type(item):

    if "type" in item:
        return item["type"]


    if "category" in item:
        return item["category"]


    if "language" in item:
        return "code"


    if "problem" in item:
        return "reasoning"


    if "tool" in item:
        return "tools"


    if "instruction" in item and "response" in item:
        return "instruction"


    if "messages" in item:
        return "chat"


    return "unknown"




def collect():

    categories = {}


    folders = [

        "chat",

        "code",

        "instruction",

        "reasoning",

        "tools"

    ]


    for folder_name in folders:


        folder = RAW / folder_name


        if not folder.exists():
            continue


        for file in folder.rglob("*.jsonl"):


            print(
                "Loading:",
                file
            )


            for item in load_jsonl(file):


                category = detect_type(
                    item
                )


                if category == "unknown":
                    continue


                if category not in categories:
                    categories[category] = []


                categories[category].append(
                    item
                )


    return categories




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




def main():

    print(
        "Balancing NexusDataset..."
    )


    categories = collect()


    print()


    for name, data in categories.items():

        print(
            name,
            len(data)
        )


    total = sum(
        len(x)
        for x in categories.values()
    )


    result = []

    stats = {}



    for category, ratio in TARGET_RATIO.items():


        if category not in categories:

            stats[category] = 0

            continue


        amount = int(
            total * ratio
        )


        data = categories[category]


        random.shuffle(
            data
        )


        selected = data[:amount]


        result.extend(
            selected
        )


        stats[category] = len(selected)



    random.shuffle(
        result
    )


    save_jsonl(
        OUTPUT,
        result
    )


    with open(
        STATS,
        "w",
        encoding="utf-8"
    ) as f:


        json.dump(
            {

                "total_before":
                total,


                "total_after":
                len(result),


                "categories":
                stats

            },

            f,

            indent=4,

            ensure_ascii=False

        )


    print()

    print(
        "DONE"
    )


    print(
        json.dumps(
            stats,
            indent=4,
            ensure_ascii=False
        )
    )



if __name__ == "__main__":

    main()