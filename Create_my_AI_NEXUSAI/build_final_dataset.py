import json
import hashlib
import random
from pathlib import Path
from collections import defaultdict


ROOT = Path(
    "datasets/NexusAI_v0.1"
)


RAW = ROOT / "raw"

OUTPUT = ROOT / "processed"


CATEGORIES = [
    "chat",
    "instruction",
    "code",
    "reasoning",
    "tools"
]


TRAIN_RATIO = 0.9


SEED = 42



stats = {

    "total":0,

    "duplicates_removed":0,

    "categories":defaultdict(int),

    "train":0,

    "validation":0

}



def hash_item(item):

    text = json.dumps(
        item,
        ensure_ascii=False,
        sort_keys=True
    )

    return hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()



def load_jsonl(path):

    data=[]


    with open(
        path,
        encoding="utf-8"
    ) as f:


        for line in f:

            try:

                item=json.loads(
                    line
                )

                data.append(
                    item
                )

            except:

                pass


    return data



def collect_data():

    result=[]

    hashes=set()


    for category in CATEGORIES:


        folder = RAW / category


        if not folder.exists():

            continue



        for file in folder.rglob(
            "*.jsonl"
        ):


            print(
                "Loading:",
                file
            )


            items=load_jsonl(
                file
            )


            for item in items:


                h=hash_item(
                    item
                )


                if h in hashes:

                    stats[
                        "duplicates_removed"
                    ] += 1

                    continue



                hashes.add(
                    h
                )


                item[
                    "category"
                ] = category


                result.append(
                    item
                )


                stats[
                    "categories"
                ][category]+=1



    return result



def save_jsonl(path,data):

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
        "Building NexusDataset v0.1 final..."
    )


    OUTPUT.mkdir(
        parents=True,
        exist_ok=True
    )


    data=collect_data()


    stats["total"]=len(
        data
    )


    random.seed(
        SEED
    )


    random.shuffle(
        data
    )


    split=int(
        len(data)*TRAIN_RATIO
    )


    train=data[:split]

    validation=data[split:]



    save_jsonl(
        OUTPUT/"train.jsonl",
        train
    )


    save_jsonl(
        OUTPUT/"validation.jsonl",
        validation
    )


    stats["train"]=len(
        train
    )

    stats["validation"]=len(
        validation
    )



    stats["categories"]=dict(
        stats["categories"]
    )


    with open(
        OUTPUT/"dataset_stats.json",
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



if __name__=="__main__":

    main()