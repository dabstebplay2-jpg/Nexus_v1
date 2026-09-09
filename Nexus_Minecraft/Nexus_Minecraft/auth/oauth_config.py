import json
import os
from pathlib import Path

try:
    from storage.paths import DATA_DIR
except Exception:
    DATA_DIR = Path("data")


DEFAULT_MICROSOFT_REDIRECT_URI = "http://localhost:8089/auth/microsoft/callback"
DEFAULT_ELY_CLIENT_ID = "nexus-launcher"
DEFAULT_ELY_REDIRECT_URI = "http://localhost:8089/auth/ely/callback"
OAUTH_SETTINGS_FILE = DATA_DIR / "oauth_settings.json"


def load_oauth_settings():
    try:
        if OAUTH_SETTINGS_FILE.exists():
            data = json.loads(OAUTH_SETTINGS_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}


def save_oauth_settings(data):
    if not isinstance(data, dict):
        data = {}
    OAUTH_SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = OAUTH_SETTINGS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OAUTH_SETTINGS_FILE)


def update_oauth_settings(**kwargs):
    data = load_oauth_settings()
    for key, value in kwargs.items():
        if value is None:
            continue
        data[key] = str(value).strip()
    save_oauth_settings(data)
    return data


def _setting_or_env(setting_key, env_key, default=""):
    data = load_oauth_settings()
    value = os.environ.get(env_key, "").strip()
    if value:
        return value
    return str(data.get(setting_key, default) or "").strip()


def get_microsoft_client_id():
    return _setting_or_env("microsoft_client_id", "NEXUS_MICROSOFT_CLIENT_ID", "")


def get_microsoft_redirect_uri():
    return _setting_or_env(
        "microsoft_redirect_uri",
        "NEXUS_MICROSOFT_REDIRECT_URI",
        DEFAULT_MICROSOFT_REDIRECT_URI,
    )


def get_ely_client_id():
    return _setting_or_env("ely_client_id", "NEXUS_ELY_CLIENT_ID", DEFAULT_ELY_CLIENT_ID)


def get_ely_client_secret():
    return _setting_or_env("ely_client_secret", "NEXUS_ELY_CLIENT_SECRET", "")


def get_ely_redirect_uri():
    return _setting_or_env(
        "ely_redirect_uri",
        "NEXUS_ELY_REDIRECT_URI",
        DEFAULT_ELY_REDIRECT_URI,
    )


def microsoft_is_configured():
    return bool(get_microsoft_client_id() and get_microsoft_redirect_uri())


def ely_is_public_client():
    return not bool(get_ely_client_secret())


def ely_is_configured():
    return bool(get_ely_client_id() and get_ely_redirect_uri())


# Backward-compatible names for older code paths. New code should use getters above.
MICROSOFT_CLIENT_ID = get_microsoft_client_id()
MICROSOFT_REDIRECT_URI = get_microsoft_redirect_uri()
ELY_CLIENT_ID = get_ely_client_id()
ELY_CLIENT_SECRET = get_ely_client_secret()
ELY_REDIRECT_URI = get_ely_redirect_uri()
