"""Single-process cloud launcher."""
from __future__ import annotations

import os
import socket
import subprocess
import sys

HOST = "127.0.0.1"
PORT = 8080
ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "nexus-cloud-server")
)


def port_in_use(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return sock.connect_ex((HOST, port)) == 0
    finally:
        sock.close()


def main() -> None:
    if port_in_use(PORT):
        raise SystemExit(
            f"Port {PORT} busy. Run nexus.bat stop and close old Cloud windows."
        )

    print(f"Nexus Cloud: http://{HOST}:{PORT}")
    os.chdir(ROOT)
    env = os.environ.copy()
    env.pop("UVICORN_RELOAD", None)
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        HOST,
        "--port",
        str(PORT),
        "--workers",
        "1",
    ]
    raise SystemExit(subprocess.call(cmd, env=env))


if __name__ == "__main__":
    main()
