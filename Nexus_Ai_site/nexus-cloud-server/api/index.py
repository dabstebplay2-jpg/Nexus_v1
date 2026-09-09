"""Vercel serverless ASGI entry."""
import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

os.environ.setdefault("VERCEL", "1")
os.environ.setdefault(
    "NEXUS_CLOUD_DATABASE_URL",
    os.environ.get("NEXUS_CLOUD_DATABASE_URL", "sqlite:////tmp/nexus_cloud_v2.db"),
)

from app.main import app  # noqa: E402, F401
