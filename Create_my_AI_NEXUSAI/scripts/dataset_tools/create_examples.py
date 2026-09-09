import json
from pathlib import Path


ROOT = Path(
    "datasets/NexusAI_v0.1/raw"
)



def save(path,data):

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



chat = [

{
"id":"chat_001",

"messages":[

{
"role":"user",
"content":"Что такое Python?"
},

{
"role":"assistant",
"content":"Python — это язык программирования высокого уровня."
}

]

}

]



instruction=[

{
"id":"instruction_001",

"instruction":
"Напиши функцию сложения",

"input":
"Python",

"output":
"def add(a,b):\n    return a+b"

}

]



code=[

{

"id":"code_001",

"language":"python",

"task":
"Создай функцию сортировки",

"code":
"def sort_list(data):\n    return sorted(data)"

}

]



reasoning=[

{

"id":"reason_001",

"problem":
"5+5",

"analysis":
"Нужно сложить два числа",

"answer":
"10"

}

]



tools=[

{

"id":"tool_001",

"task":
"Создай папку",

"tool":
"filesystem.mkdir",

"arguments":
{
"path":"project"
}

}

]



save(
ROOT/"chat/example.jsonl",
chat
)


save(
ROOT/"instruction/example.jsonl",
instruction
)


save(
ROOT/"code/example.jsonl",
code
)


save(
ROOT/"reasoning/example.jsonl",
reasoning
)


save(
ROOT/"tools/example.jsonl",
tools
)


print("Examples created")

