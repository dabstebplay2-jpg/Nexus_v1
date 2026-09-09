import json
from pathlib import Path


ROOT = Path("datasets/NexusAI_v0.1")

RAW = ROOT / "raw"

OUTPUT = ROOT / "processed" / "normalized_v0.2.jsonl"


stats = {
    "total": 0,
    "chat": 0,
    "instruction": 0,
    "code": 0,
    "reasoning": 0,
    "tools": 0
}


def write(item, out):

    out.write(
        json.dumps(
            item,
            ensure_ascii=False
        )
        + "\n"
    )


def clean_chat(item):

    messages = []

    for msg in item.get("messages", []):

        content = msg.get("content")

        if content and str(content).strip():

            messages.append(
                {
                    "role": msg["role"],
                    "content": content
                }
            )


    if len(messages) < 2:
        return None


    if not any(
        x["role"] == "user"
        for x in messages
    ):
        return None


    if not any(
        x["role"] == "assistant"
        for x in messages
    ):
        return None


    return {
        "id": item.get("id"),
        "type": "chat",
        "messages": messages
    }



def normalize(item):


    item_type = item.get(
        "type"
    )


    # уже готовый chat

    if item_type == "chat":

        return clean_chat(item)



    # code

    if item_type == "code":

        if item.get("code"):

            return item



    # reasoning

    if item_type == "reasoning":

        if item.get("problem") and item.get("answer"):

            return item



    # dolly

    if (
        "instruction" in item
        and "response" in item
    ):

        return {
            "id": item.get("id"),
            "type": "instruction",
            "messages":[
                {
                    "role":"user",
                    "content":item["instruction"]
                },
                {
                    "role":"assistant",
                    "content":item["response"]
                }
            ]
        }



    return None



def main():

    print(
        "Normalizing NexusDataset v0.3..."
    )


    if OUTPUT.exists():

        OUTPUT.unlink()


    with open(
        OUTPUT,
        "w",
        encoding="utf-8"
    ) as out:


        for file in RAW.rglob("*.jsonl"):

            print(
                "Processing:",
                file
            )


            with open(
                file,
                encoding="utf-8"
            ) as f:


                for line in f:

                    try:

                        item=json.loads(line)

                    except:

                        continue


                    result = normalize(item)


                    if result:

                        write(
                            result,
                            out
                        )

                        stats["total"] += 1

                        stats[result["type"]] += 1



    print()

    print("DONE")

    print(stats)



if __name__=="__main__":

    main()