import torch

print("Версия PyTorch:", torch.__version__)
print("CUDA доступна:", torch.cuda.is_available())

if torch.cuda.is_available():
    print("Моя видеокарта:", torch.cuda.get_device_name(0))
    print("Память GPU:", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2), "GB")
else:
    print("GPU не найдена")