import json
import hashlib
from pathlib import Path
from collections import defaultdict


ROOT = Path(
    "datasets/NexusAI_v0.1/raw"
)


REPORT = Path(
    "datasets/NexusAI_v0.1/metadata/quality_report.json"
)


CATEGORIES = [
    "chat",
    "instruction",
    "code",
    "reasoning",
    "tools"
]


stats = {

    "total_examples": 0,

    "files_checked": 0,

    "duplicates": 0,

    "empty_examples": 0,

    "by_category": defaultdict(int),

    "errors": []

}


seen_hashes = set()



def get_hash(text):

    return hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()



def validate_common(item):

    if "id" not in item:

        return False, "Missing id"


    return True, None



def validate_chat(item):

    messages = item.get(
        "messages"
    )


    if not messages:

        return False, "No messages"


    if len(messages) < 2:

        return False, "Too few messages"


    return validate_messages(
        messages
    )



def validate_instruction(item):

    return validate_chat(
        item
    )



def validate_messages(messages):

    roles = [
        x.get("role")
        for x in messages
    ]


    if "user" not in roles:

        return False, "No user message"


    if "assistant" not in roles:

        return False, "No assistant message"



    for message in messages:

        content = message.get(
            "content"
        )


        if not content:

            return False, "Empty content"



    return True, None



def validate_code(item):

    required = [

        "language",

        "code"

    ]


    for field in required:

        if field not in item:

            return False, f"Missing {field}"


    return True, None



def validate_reasoning(item):

    required = [

        "problem",

        "answer"

    ]


    for field in required:

        if field not in item:

            return False, f"Missing {field}"


    return True, None



def validate_tools(item):

    required = [

        "task",

        "tool"

    ]


    for field in required:

        if field not in item:

            return False, f"Missing {field}"


    return True, None



def validate_item(item, category):


    ok, error = validate_common(
        item
    )


    if not ok:

        return False, error



    if category == "chat":

        return validate_chat(
            item
        )


    if category == "instruction":

        return validate_instruction(
            item
        )


    if category == "code":

        return validate_code(
            item
        )


    if category == "reasoning":

        return validate_reasoning(
            item
        )


    if category == "tools":

        return validate_tools(
            item
        )


    return False, "Unknown category"



def validate_file(path, category):


    with open(
        path,
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

                stats["errors"].append(

                    f"{path}:{line_number} invalid json"

                )

                continue



            stats["total_examples"] += 1

            stats["by_category"][category] += 1



            raw = json.dumps(
                item,
                ensure_ascii=False
            )



            if not raw.strip():

                stats["empty_examples"] += 1

                continue



            h = get_hash(
                raw
            )


            if h in seen_hashes:

                stats["duplicates"] += 1


            else:

                seen_hashes.add(
                    h
                )



            ok, error = validate_item(
                item,
                category
            )



            if not ok:

                stats["errors"].append(

                    f"{path}:{line_number} {error}"

                )



def main():


    print(
        "Validating NexusDataset v0.1..."
    )



    for category in CATEGORIES:


        folder = ROOT / category


        if not folder.exists():

            continue



        files = list(
            folder.rglob(
                "*.jsonl"
            )
        )


        for file in files:


            print(
                "Checking:",
                file
            )


            stats["files_checked"] += 1


            validate_file(
                file,
                category
            )



    REPORT.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    stats["by_category"] = dict(
        stats["by_category"]
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
        "Finished!"
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