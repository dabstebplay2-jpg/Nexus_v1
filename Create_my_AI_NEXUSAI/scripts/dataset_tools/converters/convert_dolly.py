import json
from pathlib import Path

from convert_common import (
    save_jsonl,
    clean_text,
    make_id,
    valid_text
)



INPUT = Path(
    "datasets/NexusAI_v0.1/raw/downloads/dolly.jsonl"
)


OUTPUT = Path(
    "datasets/NexusAI_v0.1/raw/instruction/dolly.jsonl"
)



def convert():


    result = []

    index = 0


    with open(
        INPUT,
        encoding="utf-8"
    ) as f:


        for line in f:


            item = json.loads(
                line
            )


            instruction = clean_text(
                item.get(
                    "instruction"
                )
            )


            context = clean_text(
                item.get(
                    "context"
                )
            )


            response = clean_text(
                item.get(
                    "response"
                )
            )


            if not valid_text(response):

                continue



            if context:

                user_text = (
                    instruction
                    +
                    "\n\nContext:\n"
                    +
                    context
                )

            else:

                user_text = instruction



            if not valid_text(user_text):

                continue



            result.append(

                {

                "id":
                make_id(
                    "dolly",
                    index
                ),


                "category":
                "instruction",


                "source":
                "databricks-dolly-15k",


                "messages":

                [

                    {

                    "role":
                    "user",

                    "content":
                    user_text

                    },


                    {

                    "role":
                    "assistant",

                    "content":
                    response

                    }

                ]

                }

            )


            index += 1



    save_jsonl(
        OUTPUT,
        result
    )


    print(
        "Converted:",
        len(result)
    )



if __name__ == "__main__":

    convert()

