"""Install the CPU-compatible DLL missing from the official CUDA wheel.

The 0.3.35 CUDA wheel enables AVX-512 in ggml-cpu.dll. Ryzen 5 5600 supports
AVX2 but not AVX-512, so llama_init_from_model otherwise exits with Windows
error 0xc000001d. The official CPU wheel uses the same ABI and ships a generic
AVX2 ggml-cpu.dll. This script downloads that exact wheel, verifies its GitHub
release digest, and replaces only the CPU backend DLL.
"""

from __future__ import annotations

import hashlib
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path


VERSION = "0.3.35"
WHEEL_URL = (
    "https://github.com/abetlen/llama-cpp-python/releases/download/"
    f"v{VERSION}/llama_cpp_python-{VERSION}-py3-none-win_amd64.whl"
)
WHEEL_SHA256 = "31590ea000d5aff6f05f1e428048e72318a83709288159a5bd4dabec530080bb"
DLL_MEMBER = "llama_cpp/lib/ggml-cpu.dll"


def main() -> None:
    if sys.platform != "win32":
        print("CPU compatibility patch is only needed on Windows")
        return

    target = (
        Path(sys.prefix)
        / "Lib"
        / "site-packages"
        / "llama_cpp"
        / "lib"
        / "ggml-cpu.dll"
    )
    if not target.is_file():
        raise RuntimeError(
            "llama-cpp-python is not installed in this environment. "
            "Install requirements.txt first."
        )

    with tempfile.TemporaryDirectory(prefix="minicursor-cpu-wheel-") as temp_dir:
        wheel_path = Path(temp_dir) / "llama_cpp_python_cpu.whl"
        print(f"Downloading official CPU wheel {VERSION}...")
        urllib.request.urlretrieve(WHEEL_URL, wheel_path)
        digest = hashlib.sha256(wheel_path.read_bytes()).hexdigest()
        if digest != WHEEL_SHA256:
            raise RuntimeError(
                f"CPU wheel checksum mismatch: expected {WHEEL_SHA256}, got {digest}"
            )

        with zipfile.ZipFile(wheel_path) as wheel:
            replacement = wheel.read(DLL_MEMBER)
        target.write_bytes(replacement)

    print(f"Installed AVX2-compatible CPU backend: {target}")


if __name__ == "__main__":
    main()
