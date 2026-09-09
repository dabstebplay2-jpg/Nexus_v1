import torch


def setup_cuda():

    if torch.cuda.is_available():

        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

        print("CUDA optimization enabled")
        print(
            "TF32:",
            torch.backends.cuda.matmul.allow_tf32
        )

    else:
        print("CUDA not available")