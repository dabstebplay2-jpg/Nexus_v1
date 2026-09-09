"""Hardware smoke test. This intentionally is not collected by pytest."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from models.manager import ModelManager  # noqa: E402


def main() -> None:
    manager = ModelManager()
    matches = [model for model in manager.models if "Qwen3.5-9B-UD-Q5_K_XL" in model.name]
    if not matches:
        raise RuntimeError("Qwen3.5-9B-UD-Q5_K_XL.gguf was not found")

    selected = matches[0]
    print(f"Loading [{selected.id}] {selected.name}")
    status = manager.load(selected.id, progress=print)
    print(f"CUDA device: {status.get('gpu_name')}")
    print(f"VRAM increase: {status.get('vram_delta_mib')} MiB")
    if status.get("device") != "CUDA" or status.get("n_gpu_layers") != -1:
        raise RuntimeError("Full CUDA offload was not confirmed")

    print("MiniCursor> ", end="", flush=True)
    response_parts = []
    for token in manager.chat(
        [{"role": "user", "content": "Reply with exactly: CUDA READY"}],
        max_tokens=64,
        temperature=0.0,
    ):
        response_parts.append(token)
        print(token, end="", flush=True)
    response = "".join(response_parts)
    print()
    if not response.strip():
        raise RuntimeError("The model returned an empty response")

    unloaded = manager.unload()
    print(f"VRAM freed: {unloaded.get('vram_freed_mib')} MiB")
    if not unloaded.get("was_loaded"):
        raise RuntimeError("Unload did not close the active model")
    print("HARDWARE SMOKE TEST PASSED")


if __name__ == "__main__":
    main()
