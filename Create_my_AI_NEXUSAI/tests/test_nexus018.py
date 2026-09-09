import torch

from tokenizer.nexus_bpe_tokenizer import NexusBPETokenizer
from model.gpt_model_v016 import NexusGPT016


device = "cuda" if torch.cuda.is_available() else "cpu"


print("Loading NexusAI v0.018...")


tokenizer = NexusBPETokenizer()

tokenizer.tokenizer = tokenizer.tokenizer.from_file(
    "models/NexusAI_v0.017/tokenizer.json"
)


model = NexusGPT016(
    vocab_size=5000,
    context_size=128
)


checkpoint = torch.load(
    "models/NexusAI_v0.018/checkpoints/epoch_13.pth",
    map_location=device
)


model.load_state_dict(
    checkpoint["model"]
)


model.to(device)
model.eval()


print("Model loaded!")
print("Epoch:", checkpoint["epoch"])
print("Loss:", checkpoint["loss"])


while True:

    text = input("\nТы: ")

    if text == "exit":
        break


    tokens = tokenizer.tokenizer.encode(text).ids


    x = torch.tensor(
        [tokens],
        device=device
    )


    with torch.no_grad():

        for i in range(50):

            out = model(x)

            next_token = torch.argmax(
                out[:, -1, :],
                dim=-1
            )

            x = torch.cat(
                [
                    x,
                    next_token.unsqueeze(0)
                ],
                dim=1
            )


    result = tokenizer.tokenizer.decode(
        x[0].tolist()
    )


    print("\nNexus:", result)