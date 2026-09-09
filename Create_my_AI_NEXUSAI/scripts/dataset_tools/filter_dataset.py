import json
import hashlib
from pathlib import Path


INPUT = Path(
    "datasets/NexusAI_v0.1/processed/train.jsonl"
)


OUTPUT = Path(
    "datasets/NexusAI_v0.1/processed/train_clean.jsonl"
)


REPORT = Path(
    "datasets/NexusAI_v0.1/processed/filter_report.json"
)



MAX_CHARS = 8000
MIN_CHARS = 20



def make_hash(item):

    text = json.dumps(
        item,
        ensure_ascii=False,
        sort_keys=True
    )

    return hashlib.md5(
        text.encode("utf-8")
    ).hexdigest()



def extract_text(item):

    result=[]


    if "messages" in item:

        for msg in item["messages"]:

            result.append(
                msg.get(
                    "content",
                    ""
                )
            )


    if "code" in item:

        result.append(
            item.get(
                "code",
                ""
            )
        )


    if "problem" in item:

        result.append(
            item.get(
                "problem",
                ""
            )
        )

        result.append(
            item.get(
                "answer",
                ""
            )
        )


    if "task" in item:

        result.append(
            item.get(
                "task",
                ""
            )
        )


    return "\n".join(result)




def clean_text(text):

    return (
        text
        .replace("\x00","")
        .replace("\r","")
        .strip()
    )




def main():


    print(
        "Filtering NexusDataset..."
    )


    result=[]

    hashes=set()


    stats={

        "input":0,

        "output":0,

        "removed_duplicate":0,

        "removed_empty":0,

        "removed_short":0,

        "removed_long":0

    }



    with open(
        INPUT,
        encoding="utf-8"
    ) as f:


        for line in f:


            stats["input"]+=1


            try:

                item=json.loads(
                    line
                )

            except:

                continue



            text=extract_text(
                item
            )


            text=clean_text(
                text
            )



            if len(text)==0:

                stats["removed_empty"]+=1

                continue



            if len(text)<MIN_CHARS:

                stats["removed_short"]+=1

                continue



            if len(text)>MAX_CHARS:

                stats["removed_long"]+=1

                continue



            h=make_hash(
                item
            )


            if h in hashes:

                stats["removed_duplicate"]+=1

                continue


            hashes.add(h)


            result.append(
                item
            )



    with open(
        OUTPUT,
        "w",
        encoding="utf-8"
    ) as f:


        for item in result:

            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



    stats["output"]=len(result)



    with open(
        REPORT,
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
        json.dumps(
            stats,
            indent=4,
            ensure_ascii=False
        )
    )


    print()

    print(
        "Saved:",
        OUTPUT
    )



if __name__=="__main__":

    main()