import os

CLOUD_SERVER_URL = os.environ.get("NEXUS_CLOUD_SERVER_URL", "http://127.0.0.1:8080")
CONFIG_FILE_PATH = os.path.expanduser("~/.nexus_ide_config.json")

# Windows: системный прокси ломает запросы на 127.0.0.1 (ответ 503 без тела).
HTTPX_CLIENT_KWARGS = {"trust_env": False}

_default_cors = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"
_cors_raw = os.environ.get("NEXUS_CORS_ORIGINS", _default_cors).strip()
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]
