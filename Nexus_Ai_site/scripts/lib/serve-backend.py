"""Single-process backend launcher (avoids port 8000 conflicts on Windows)."""
from __future__ import annotations

import os
import socket
import subprocess
import sys

HOST = "127.0.0.1"
PORTS = (8000, 8001, 8002)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))


def port_in_use(port: int) -> bool:
    """On Windows, bind()+SO_REUSEADDR can lie; connect detects a real listener."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return sock.connect_ex((HOST, port)) == 0
    finally:
        sock.close()


def pick_port() -> int:
    for port in PORTS:
        if not port_in_use(port):
            return port
    raise SystemExit(
        f"Ports {PORTS} are busy. Run nexus.bat stop or close old python/uvicorn windows."
    )


def write_frontend_env(port: int) -> None:
    if port == 8000:
        return
    env_path = os.path.join(ROOT, "..", "frontend", ".env.local")
    with open(env_path, "w", encoding="utf-8") as fh:
        fh.write(f"VITE_API_BASE=http://{HOST}:{port}/api\n")
    print(f"Wrote {env_path} -> port {port} (restart frontend: npm run dev)")


def main() -> None:
    port = pick_port()
    if port != 8000:
        print(f"NOTE: port 8000 busy, using {port}.")
        write_frontend_env(port)
    print(f"Nexus Backend: http://{HOST}:{port}")
    os.chdir(ROOT)
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        HOST,
        "--port",
        str(port),
        "--workers",
        "1",
        "--no-access-log",
    ]
    env = os.environ.copy()
    env.pop("UVICORN_RELOAD", None)
    raise SystemExit(subprocess.call(cmd, env=env))


if __name__ == "__main__":
    main()
