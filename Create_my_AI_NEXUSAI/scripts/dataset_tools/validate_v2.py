import json
import hashlib
from pathlib import Path


INPUT = Path(
    "datasets/NexusAI_v0.1/processed/normalized_v0.2.jsonl"
)

REPORT = Path(
    "datasets/NexusAI_v0.1/metadata/validation_v2.json"
)


stats = {

    "dataset": "NexusDataset v0.2",

    "total": 0,

    "valid": 0,

    "invalid": 0,

    "duplicates": 0,

    "characters": 0,

    "categories": {},

    "errors": []

}


seen = set()



def hash_item(item):

    text = json.dumps(
        item,
        ensure_ascii=False,
        sort_keys=True
    )

    return hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()



def add_category(category):

    if category not in stats["categories"]:

        stats["categories"][category] = 0



def check_messages(item):

    messages = item.get(
        "messages"
    )


    if not isinstance(messages, list):

        return False, "messages not list"


    if len(messages) < 2:

        return False, "too few messages"



    roles = [
        m.get("role")
        for m in messages
    ]


    if "user" not in roles:

        return False, "missing user"



    if "assistant" not in roles:

        return False, "missing assistant"



    for msg in messages:

        content = msg.get(
            "content",
            ""
        )


        if not str(content).strip():

            return False, "empty message"



    return True, None



def validate(item):


    if not item.get("id"):

        return False, "missing id"



    item_type = item.get(
        "type"
    )


    if not item_type:

        return False, "missing type"



    if item_type in [
        "chat",
        "instruction"
    ]:

        return check_messages(
            item
        )



    if item_type == "code":

        if not item.get(
            "code"
        ):

            return False, "empty code"



    elif item_type == "reasoning":

        if not item.get(
            "problem"
        ):

            return False, "missing problem"


        if not item.get(
            "answer"
        ):

            return False, "missing answer"



    elif item_type == "tools":

        if not item.get(
            "task"
        ):

            return False, "missing task"



    return True, None




def get_files():


    if INPUT.is_file():

        return [
            INPUT
        ]


    return list(
        INPUT.rglob(
            "*.jsonl"
        )
    )



def main():


    print(
        "Validating NexusDataset v0.2..."
    )


    files = get_files()


    if not files:

        print(
            "ERROR: No jsonl files found"
        )

        return



    for file in files:


        print(
            "Checking:",
            file
        )


        with open(
            file,
            encoding="utf-8"
        ) as f:


            for line_number, line in enumerate(
                f,
                1
            ):


                try:

                    item = json.loads(
                        line
                    )


                except Exception:


                    stats["invalid"] += 1


                    if len(stats["errors"]) < 20:

                        stats["errors"].append(
                            f"{file}:{line_number} invalid json"
                        )


                    continue



                stats["total"] += 1



                text = json.dumps(
                    item,
                    ensure_ascii=False
                )


                stats["characters"] += len(
                    text
                )



                h = hash_item(
                    item
                )


                if h in seen:

                    stats["duplicates"] += 1

                    continue


                seen.add(
                    h
                )



                ok,error = validate(
                    item
                )



                if not ok:


                    stats["invalid"] += 1


                    if len(stats["errors"]) < 20:

                        stats["errors"].append(
                            f"{file}:{line_number} {error}"
                        )


                    continue



                stats["valid"] += 1


                category = item.get(
                    "type",
                    "unknown"
                )


                add_category(
                    category
                )


                stats["categories"][category] += 1




    REPORT.parent.mkdir(
        parents=True,
        exist_ok=True
    )


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
        REPORT
    )



if __name__ == "__main__":

    main()