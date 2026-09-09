import torch
import json

from model.gpt_model import NexusGPT


device = "cuda" if torch.cuda.is_available() else "cpu"



with open(
    "models/NexusAI_v0.015/tokenizer.json",
    encoding="utf-8"
) as f:

    tokenizer_data = json.load(f)



word_to_id = tokenizer_data["word_to_id"]

id_to_word = {
    int(k):v
    for k,v in tokenizer_data["id_to_word"].items()
}



model = NexusGPT(
    vocab_size=len(word_to_id),
    context_size=32
)



model.load_state_dict(
    torch.load(
        "models/NexusAI_v0.015/weights.pth",
        weights_only=True
    )
)



model.to(device)

model.eval()



def encode(text):

    return [
        word_to_id.get(
            w,
            word_to_id["<UNK>"]
        )
        for w in text.lower().split()
    ]



def decode(tokens):

    words=[]

    for t in tokens:

        word=id_to_word[t]

        if word == "<EOS>":
            break

        words.append(word)


    return " ".join(words)



def generate(
    start,
    length=20
):

    tokens = encode(start)


    for _ in range(length):

        context = tokens[-32:]


        while len(context)<32:

            context.insert(
                0,
                word_to_id["<PAD>"]
            )


        x=torch.tensor(
            [context],
            device=device
        )


        with torch.no_grad():

            output=model(x)



        next_token=torch.argmax(
            output,
            dim=1
        ).item()



        tokens.append(
            next_token
        )


    return decode(tokens)



print(
    "NexusGPT v0.015"
)


print(
    generate("кот")
)
