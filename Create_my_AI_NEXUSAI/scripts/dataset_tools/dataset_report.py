import json
from pathlib import Path
from collections import Counter


DATASET = Path(
    "datasets/NexusAI_v0.1/processed/train.jsonl"
)


REPORT = Path(
    "datasets/NexusAI_v0.1/processed/dataset_report.json"
)



def count_tokens(text):

    if not text:
        return 0

    # грубая оценка для BPE
    return len(text) // 4




def extract_text(item):

    texts=[]


    if "messages" in item:

        for msg in item["messages"]:

            texts.append(
                msg.get(
                    "content",
                    ""
                )
            )


    if "problem" in item:

        texts.append(
            item.get(
                "problem",
                ""
            )
        )

        texts.append(
            item.get(
                "answer",
                ""
            )
        )


    if "code" in item:

        texts.append(
            item.get(
                "code",
                ""
            )
        )


    if "task" in item:

        texts.append(
            item.get(
                "task",
                ""
            )
        )


    return "\n".join(texts)




def main():


    print(
        "Analyzing NexusDataset..."
    )


    total=0

    categories=Counter()

    chars=0

    tokens=0

    lengths=[]


    with open(
        DATASET,
        encoding="utf-8"
    ) as f:


        for line in f:


            item=json.loads(
                line
            )


            total+=1


            category=item.get(
                "type",
                "unknown"
            )


            categories[category]+=1



            text=extract_text(
                item
            )


            size=len(text)

            chars+=size


            t=count_tokens(
                text
            )

            tokens+=t


            lengths.append(
                size
            )



    lengths.sort(
        reverse=True
    )


    report={

        "dataset":
        str(DATASET),


        "examples":
        total,


        "categories":
        dict(categories),


        "characters":
        chars,


        "estimated_tokens":
        tokens,


        "average_chars":
        chars//max(total,1),


        "average_tokens":
        tokens//max(total,1),


        "largest_examples_chars":
        lengths[:10]

    }



    with open(
        REPORT,
        "w",
        encoding="utf-8"
    ) as f:


        json.dump(
            report,
            f,
            indent=4,
            ensure_ascii=False
        )



    print()

    print(
        json.dumps(
            report,
            indent=4,
            ensure_ascii=False
        )
    )


    print()

    print(
        "Saved:",
        REPORT
    )



if __name__=="__main__":

    main()