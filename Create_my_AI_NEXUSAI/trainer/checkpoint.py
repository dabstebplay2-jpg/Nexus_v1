import torch
import os


def save_checkpoint(
    model,
    optimizer,
    epoch,
    loss,
    path
):

    torch.save(
        {
            "epoch": epoch,
            "loss": loss,
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict()
        },
        path
    )



def load_checkpoint(
    path,
    model,
    optimizer
):

    checkpoint = torch.load(
        path,
        map_location="cuda"
    )

    model.load_state_dict(
        checkpoint["model"]
    )

    optimizer.load_state_dict(
        checkpoint["optimizer"]
    )

    return checkpoint["epoch"], checkpoint["loss"]
