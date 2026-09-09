import json
import random
import hashlib
from pathlib import Path


ROOT = Path("datasets/NexusAI_v0.1")

RAW = ROOT / "raw"
PROCESSED = ROOT / "processed"


TRAIN = PROCESSED / "train.jsonl"
VAL = PROCESSED / "validation.jsonl"

STATS = PROCESSED / "dataset_stats.json"


random.seed(42)



def load_jsonl(path):

    data = []

    with open(
        path,
        encoding="utf-8"
    ) as f:

        for line in f:

            try:
                item = json.loads(line)
                data.append(item)

            except:
                continue

    return data




def hash_item(item):

    text = json.dumps(
        item,
        ensure_ascii=False,
        sort_keys=True
    )

    return hashlib.md5(
        text.encode("utf-8")
    ).hexdigest()




def normalize(item):


    if "messages" in item:

        messages = item["messages"]

        if len(messages) < 2:
            return None


        item_type = item.get(
            "category",
            "chat"
        )


        if item_type == "instruction":

            return {
                "id": item.get("id"),
                "type": "instruction",
                "messages": messages
            }


        return {
            "id": item.get("id"),
            "type": "chat",
            "messages": messages
        }



    if "problem" in item:

        return {
            "id": item.get("id"),
            "type": "reasoning",
            "problem": item.get("problem"),
            "answer": item.get("answer")
        }



    if "language" in item:

        return {
            "id": item.get("id"),
            "type": "code",
            "language": item.get("language"),
            "code": item.get("code")
        }



    if "task" in item and "tool" in item:

        return {
            "id": item.get("id"),
            "type": "tools",
            "task": item.get("task"),
            "tool": item.get("tool"),
            "arguments": item.get(
                "arguments",
                {}
            )
        }



    return None

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
        "Building NexusDataset v0.1 FINAL"
    )


    all_data=[]

    hashes=set()


    stats_category={}



    for file in RAW.rglob("*.jsonl"):


        # пропускаем скачанные оригиналы
        if "downloads" in str(file):

            continue


        print(
            "Loading:",
            file
        )


        items=load_jsonl(file)



        for item in items:


            clean=normalize(item)


            if clean is None:
                continue



            h=hash_item(clean)


            if h in hashes:
                continue


            hashes.add(h)


            all_data.append(clean)



            t=clean["type"]

            stats_category[t]=(
                stats_category.get(t,0)+1
            )




    print()

    print(
        "Total:",
        len(all_data)
    )


    print(
        "Categories:",
        stats_category
    )



    random.shuffle(
        all_data
    )


    split=int(
        len(all_data)*0.95
    )



    train=all_data[:split]

    val=all_data[split:]



    PROCESSED.mkdir(
        parents=True,
        exist_ok=True
    )



    save_jsonl(
        TRAIN,
        train
    )


    save_jsonl(
        VAL,
        val
    )



    stats={

        "total":
        len(all_data),

        "train":
        len(train),

        "validation":
        len(val),

        "categories":
        stats_category,

        "version":
        "NexusDataset v0.1"

    }



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