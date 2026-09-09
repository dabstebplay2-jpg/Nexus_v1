import json
from pathlib import Path
import hashlib


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


counter = 0



def make_id(prefix):

    global counter

    counter += 1

    return f"{prefix}_{counter}"



def save(items, file):

    with open(
        file,
        "a",
        encoding="utf-8"
    ) as f:

        for item in items:

            f.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                +
                "\n"
            )



def normalize_openassistant(item):

    if "text" not in item:
        return None


    role = item.get(
        "role"
    )


    if role not in [
        "prompter",
        "assistant"
    ]:
        return None


    return {
        "id": make_id("oasst"),
        "type": "chat",
        "messages": [
            {
                "role": "user" if role == "prompter" else "assistant",
                "content": item["text"]
            }
        ]
    }



def normalize_codealpaca(item):

    if "instruction" not in item:
        return None


    output = item.get(
        "output",
        ""
    )


    if not output:
        return None


    return {
        "id": make_id("code"),
        "type": "code",
        "language": "python",
        "messages": [
            {
                "role": "user",
                "content": item["instruction"]
            },
            {
                "role": "assistant",
                "content": output
            }
        ],
        "code": output
    }



def normalize_gsm(item):

    question = item.get(
        "question"
    )


    answer = item.get(
        "answer"
    )


    if not question or not answer:
        return None


    return {
        "id": make_id("gsm"),
        "type": "reasoning",
        "problem": question,
        "answer": answer
    }



def normalize_dolly(item):

    instruction = item.get(
        "instruction"
    )


    response = item.get(
        "response"
    )


    if not instruction or not response:
        return None


    context = item.get(
        "context",
        ""
    )


    if context:

        instruction += "\n\nContext:\n" + context


    return {
        "id": make_id("dolly"),
        "type": "instruction",
        "messages": [
            {
                "role": "user",
                "content": instruction
            },
            {
                "role": "assistant",
                "content": response
            }
        ]
    }



def normalize(item):


    if "text" in item and "role" in item:

        return normalize_openassistant(item)


    if "instruction" in item and "output" in item:

        return normalize_codealpaca(item)


    if "question" in item and "answer" in item:

        return normalize_gsm(item)


    if "instruction" in item and "response" in item:

        return normalize_dolly(item)


    return None




def main():

    print(
        "Normalizing NexusDataset v0.2..."
    )


    if OUTPUT.exists():

        OUTPUT.unlink()


    for file in RAW.rglob("*.jsonl"):

        print(
            "Processing:",
            file
        )


        with open(
            file,
            encoding="utf-8"
        ) as f:


            batch = []


            for line in f:


                try:

                    item = json.loads(line)

                except:

                    continue



                result = normalize(item)


                if result:

                    batch.append(result)

                    stats["total"] += 1

                    stats[result["type"]] += 1



                if len(batch) >= 1000:

                    save(
                        batch,
                        OUTPUT
                    )

                    batch = []



            if batch:

                save(
                    batch,
                    OUTPUT
                )



    print()

    print(
        "DONE"
    )


    print(
        "Total:",
        stats["total"]
    )


    print(stats)



if __name__ == "__main__":

    main()