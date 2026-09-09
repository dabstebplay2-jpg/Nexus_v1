import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from tokenizer.nexus_bpe_tokenizer import NexusBPETokenizer
from dataset_bpe import BPEDataset
from model.gpt_model_v016 import NexusGPT016

from trainer.trainer import NexusTrainer
from trainer.checkpoint import save_checkpoint
from trainer.logger import Progress

from nexus_config import setup_cuda



# =========================
# CUDA setup
# =========================

setup_cuda()


device = "cuda" if torch.cuda.is_available() else "cpu"


print()
print("==========================")
print("Nexus Trainer v0.018")
print("==========================")

print(
    "Device:",
    device
)


if device == "cuda":

    print(
        "GPU:",
        torch.cuda.get_device_name(0)
    )



# =========================
# Tokenizer
# =========================


print()
print("Loading tokenizer...")


tokenizer = NexusBPETokenizer()


tokenizer.tokenizer = tokenizer.tokenizer.from_file(
    "models/NexusAI_v0.018/tokenizer/tokenizer.json"
)



# =========================
# Dataset
# =========================


print(
    "Loading dataset..."
)


with open(
    "data/tinystories.txt",
    encoding="utf-8"
) as f:

    text = f.read()



tokens = tokenizer.tokenizer.encode(
    text
).ids



context_size = 128



dataset = BPEDataset(
    tokens,
    context_size
)



loader = DataLoader(
    dataset,
    batch_size=256,
    shuffle=True,
    pin_memory=True,
    num_workers=0
)



# =========================
# Model
# =========================


vocab_size = 5000



model = NexusGPT016(
    vocab_size,
    context_size
)



model.to(
    device
)



print()

print(
    "Parameters:",
    sum(
        p.numel()
        for p in model.parameters()
    )
)



# =========================
# Optimizer
# =========================


optimizer = torch.optim.AdamW(
    model.parameters(),
    lr=0.0005,
    weight_decay=0.01
)



loss_fn = nn.CrossEntropyLoss()



trainer = NexusTrainer(
    model,
    optimizer,
    device
)



# =========================
# Training config
# =========================


epochs = 20


print()

print(
    "Tokens:",
    len(tokens)
)

print(
    "Dataset:",
    len(dataset)
)

print(
    "Batch size:",
    256
)

print(
    "Context:",
    context_size
)

print(
    "Epochs:",
    epochs
)



best = float("inf")



# =========================
# Training loop
# =========================


for epoch in range(epochs):


    print()

    print(
        f"Epoch {epoch+1}/{epochs}"
    )


    model.train()



    progress = Progress(
        len(loader)
    )


    total_loss = 0

    valid_steps = 0



    for batch, (x, y) in enumerate(loader):


        x = x.to(
            device,
            non_blocking=True
        )


        y = y.to(
            device,
            non_blocking=True
        )



        loss = trainer.train_step(
            x,
            y,
            loss_fn
        )



        if loss is not None:

            total_loss += loss

            valid_steps += 1



        if batch % 100 == 0:

            progress.show(
                batch,
                loss if loss else 0
            )



    avg_loss = total_loss / valid_steps



    print()

    print(
        "Average Loss:",
        avg_loss
    )



    # =========================
    # Save checkpoint
    # =========================


    save_checkpoint(

        model,

        optimizer,

        epoch,

        avg_loss,

        f"models/NexusAI_v0.018/checkpoints/epoch_{epoch}.pth"

    )



    if avg_loss < best:


        best = avg_loss


        torch.save(

            model.state_dict(),

            "models/NexusAI_v0.018/best.pth"

        )


        print(
            "New best model saved!"
        )



    if device == "cuda":

        torch.cuda.empty_cache()



# =========================
# Final save
# =========================


torch.save(

    model.state_dict(),

    "models/NexusAI_v0.018/final.pth"

)



print()

print("==========================")
print("NexusAI v0.018 COMPLETE")
print(
    "Best loss:",
    best
)
print("==========================")
