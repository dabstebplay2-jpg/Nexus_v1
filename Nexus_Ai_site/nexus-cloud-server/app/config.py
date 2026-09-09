import os
from pathlib import Path

from dotenv import load_dotenv

_cloud_dir = Path(__file__).resolve().parent.parent
_repo_root = _cloud_dir.parent
if os.environ.get("NEXUS_SKIP_DOTENV", "").lower() not in ("1", "true", "yes"):
    load_dotenv(_repo_root / ".env")
    # .env сервера важнее устаревших переменных в shell (после смены ключа без перезапуска)
    load_dotenv(_cloud_dir / ".env", override=True)

def _normalize_postgres_url(url: str) -> str:
    """Render/Neon часто отдают postgres:// — SQLAlchemy 2 ожидает postgresql://."""
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


UPSTASH_REDIS_REST_URL = (os.environ.get("UPSTASH_REDIS_REST_URL") or "").strip()
UPSTASH_REDIS_REST_TOKEN = (os.environ.get("UPSTASH_REDIS_REST_TOKEN") or "").strip()


def redis_persistence_enabled() -> bool:
    return bool(UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)


def is_render_host() -> bool:
    return os.environ.get("RENDER") == "true" or bool(os.environ.get("RENDER_SERVICE_ID"))


def _resolve_database_url() -> str:
    url = os.environ.get("NEXUS_CLOUD_DATABASE_URL", "sqlite:///./nexus_cloud_v2.db").strip()
    if not url:
        url = "sqlite:///./nexus_cloud_v2.db"
    url = _normalize_postgres_url(url)
    # Upstash: рабочая SQLite в RAM, источник правды — Redis
    if redis_persistence_enabled() and "sqlite" in url and is_render_host():
        return "sqlite:///:memory:"
    # Render Free без Persistent Disk: /data не существует → падение при старте
    if "sqlite" in url and ("/data/" in url or url.rstrip("/").endswith("/data")):
        data = Path("/data")
        if not data.is_dir() or not os.access(data, os.W_OK):
            return "sqlite:///./nexus_cloud_v2.db"
    return url


DATABASE_URL = _resolve_database_url()


def database_backend() -> str:
    if DATABASE_URL.startswith("postgresql"):
        return "postgresql"
    if redis_persistence_enabled():
        return "upstash-redis"
    return "sqlite"


def database_is_ephemeral() -> bool:
    """SQLite на Render/Vercel — файл в RAM/временном диске, сбрасывается при redeploy."""
    if redis_persistence_enabled():
        return False
    if database_backend() == "postgresql":
        return False
    if is_render_host() or os.environ.get("VERCEL"):
        return True
    return False


# No default in production — local dev may set NEXUS_CLOUD_SECRET_KEY in .env
SECRET_KEY = (os.environ.get("NEXUS_CLOUD_SECRET_KEY") or "").strip() or (
    "SUPER_SECRET_NEXUS_KEY_CHANGE_THIS_IN_PRODUCTION"
    if not is_render_host() and not (os.environ.get("ENV") or "").lower().startswith("prod")
    else ""
)
ALGORITHM = "HS256"

# Через запятую: https://your-app.vercel.app,https://your-domain.ru
_cors_raw = os.environ.get("NEXUS_CORS_ORIGINS", "").strip()
NEXUS_CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()] if _cors_raw else ["*"]

# Discord ops-канал: алерты org-баланса Polza (отдельно от changelog webhook)
DISCORD_OPS_WEBHOOK_URL = (os.environ.get("DISCORD_OPS_WEBHOOK_URL") or "").strip()
# Секрет для cron (опционально): POST /v1/internal/cron/polza-balance
NEXUS_CRON_SECRET = (os.environ.get("NEXUS_CRON_SECRET") or "").strip()

# --- Polza.ai (основной провайдер ИИ) ---
POLZA_API_ROOT = (os.environ.get("POLZA_API_ROOT") or "https://polza.ai/api").rstrip("/")
POLZA_BASE_URL = (os.environ.get("POLZA_BASE_URL") or f"{POLZA_API_ROOT}/v1").rstrip("/")
POLZA_AUTH_BASE = f"{POLZA_API_ROOT}/auth"
POLZA_MCP_URL = (os.environ.get("POLZA_MCP_URL") or f"{POLZA_API_ROOT}/mcp").rstrip("/")
POLZA_BACKEND_API_KEY = (os.environ.get("POLZA_BACKEND_API_KEY") or "").strip()
POLZA_MCP_TOKEN = (os.environ.get("POLZA_MCP_TOKEN") or POLZA_BACKEND_API_KEY).strip()
POLZA_APP_NAME = (os.environ.get("POLZA_APP_NAME") or "Nexus").strip()
POLZA_OAUTH_CALLBACK_URL = (os.environ.get("POLZA_OAUTH_CALLBACK_URL") or "").strip()
POLZA_BALANCE_ALERT_COOLDOWN_HOURS = float(
    os.environ.get("POLZA_BALANCE_ALERT_COOLDOWN_HOURS", "6") or "6"
)
# Минимальный запас org-баланса Polza (₽) относительно суммы лимитов подписчиков
POLZA_BALANCE_BUFFER = float(os.environ.get("POLZA_BALANCE_BUFFER", "1.0") or "1.0")
MARGIN_MULTIPLIER = float(os.environ.get("NEXUS_MARGIN_MULTIPLIER", "1.15"))

# --- OpenRouter (тариф FREE: бесплатные модели платформы) ---
OPENROUTER_API_KEY = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
OPENROUTER_BASE_URL = (os.environ.get("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_HTTP_REFERER = (
    os.environ.get("OPENROUTER_HTTP_REFERER") or "https://nexus-zeta-ruby-12.vercel.app"
).strip()
OPENROUTER_APP_TITLE = (os.environ.get("OPENROUTER_APP_TITLE") or "Nexus").strip()
NEXUS_FREE_OPENROUTER_DAILY_LIMIT = int(os.environ.get("NEXUS_FREE_OPENROUTER_DAILY_LIMIT", "100") or "100")
NEXUS_FREE_OPENROUTER_RPM = int(os.environ.get("NEXUS_FREE_OPENROUTER_RPM", "15") or "15")
NEXUS_MODELS_REFRESH_INTERVAL_SEC = max(
    3600,
    int(os.environ.get("NEXUS_MODELS_REFRESH_INTERVAL_SEC", "86400") or "86400"),
)
OPENROUTER_MANAGEMENT_API_KEY = (os.environ.get("OPENROUTER_MANAGEMENT_API_KEY") or "").strip()
_OPENROUTER_KEY_LIMIT_RAW = (os.environ.get("NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD") or "").strip()
NEXUS_FREE_OPENROUTER_KEY_LIMIT_USD: float | None = (
    float(_OPENROUTER_KEY_LIMIT_RAW) if _OPENROUTER_KEY_LIMIT_RAW else None
)
OPENROUTER_FREE_KEY_LIMIT_RESET = (
    (os.environ.get("OPENROUTER_FREE_KEY_LIMIT_RESET") or "daily").strip().lower() or None
)
if OPENROUTER_FREE_KEY_LIMIT_RESET not in (None, "daily", "weekly", "monthly"):
    OPENROUTER_FREE_KEY_LIMIT_RESET = "daily"


def openrouter_management_enabled() -> bool:
    return bool(OPENROUTER_MANAGEMENT_API_KEY)


def openrouter_free_tier_enabled() -> bool:
    return bool(OPENROUTER_API_KEY) or openrouter_management_enabled()


# Только локальная разработка: кнопка «подтвердить оплату» без ЮKassa. В проде — false.
NEXUS_BILLING_TEST_MODE = os.environ.get("NEXUS_BILLING_TEST_MODE", "false").lower() in (
    "1",
    "true",
    "yes",
)

# Тестирование: ULTRA всем, все модели открыты, квоты не режут, смена тарифа в UI.
NEXUS_TESTING_MODE = os.environ.get("NEXUS_TESTING_MODE", "false").lower() in ("1", "true", "yes")


def is_testing_mode() -> bool:
    """Без импорта services — избегаем circular import с quota_limits."""
    return NEXUS_TESTING_MODE


# Локальная админка (UI + API на 127.0.0.1).
NEXUS_LOCAL_ADMIN = os.environ.get("NEXUS_LOCAL_ADMIN", "false").lower() in ("1", "true", "yes")
# API админки на Render — UI на ПК ходит сюда за всеми пользователями сайта.
NEXUS_REMOTE_ADMIN = os.environ.get("NEXUS_REMOTE_ADMIN", "false").lower() in ("1", "true", "yes")
NEXUS_ADMIN_PASSWORD = (os.environ.get("NEXUS_ADMIN_PASSWORD") or os.environ.get("NEXUS_ADMIN_KEY") or "").strip()
NEXUS_ADMIN_ALLOW_REMOTE = os.environ.get("NEXUS_ADMIN_ALLOW_REMOTE", "false").lower() in ("1", "true", "yes")
NEXUS_ADMIN_VERCEL_API_URL = (
    os.environ.get("NEXUS_ADMIN_VERCEL_API_URL", "https://nexus-zeta-ruby-12.vercel.app/api") or ""
).strip().rstrip("/")
# По умолчанию Vercel (/api → Render): у части ISP render.com недоступен напрямую.
NEXUS_ADMIN_DEFAULT_CLOUD_URL = (
    os.environ.get("NEXUS_ADMIN_DEFAULT_CLOUD_URL")
    or NEXUS_ADMIN_VERCEL_API_URL
    or "https://nexus-cloud-bxcc.onrender.com"
).strip().rstrip("/")

_ADMIN_UI_ORIGINS = (
    "http://127.0.0.1:8787",
    "http://localhost:8787",
    "http://127.0.0.1:8788",
    "http://localhost:8788",
    "http://127.0.0.1:8790",
    "http://localhost:8790",
)


def admin_api_enabled() -> bool:
    return NEXUS_LOCAL_ADMIN or NEXUS_REMOTE_ADMIN


def admin_cors_origins() -> list[str]:
    origins = list(NEXUS_CORS_ORIGINS)
    if admin_api_enabled():
        for o in _ADMIN_UI_ORIGINS:
            if o not in origins:
                origins.append(o)
    return origins


# Цена подписки (USD; в UI — ₽ по курсу ЦБ).
# Сбалансированная сетка (июнь 2026): якоря $10 / $20 / $100 / $200 → ~800 / 1600 / 8000 / 16000 ₽
TIER_PRICES = {
    "FREE": float(os.environ.get("TIER_FREE_PRICE_USD", "0")),
    "HOBBY": float(os.environ.get("TIER_HOBBY_PRICE_USD", "10")),
    "STANDARD": float(os.environ.get("TIER_STANDARD_PRICE_USD", "20")),
    "PRO": float(os.environ.get("TIER_PRO_PRICE_USD", "100")),
    "ULTRA": float(os.environ.get("TIER_ULTRA_PRICE_USD", "200")),
}

TIER_BALANCES = {k: 0.0 for k in ("FREE", "HOBBY", "STANDARD", "PRO", "ULTRA")}

# Доля цены подписки, которая уходит в месячный пул ИИ (остальное — комиссия платформы 8%).
# 0.92 → при 787 ₽ подписки ≈ 724 ₽ на RouterAI (честно для пользователя).
TIER_POOL_FRACTION = float(os.environ.get("NEXUS_TIER_POOL_FRACTION", "0.92"))

# Опционально зафиксировать пул в USD (если пусто — считается price × TIER_POOL_FRACTION)
TIER_MONTHLY_CAP_OVERRIDES = {
    "FREE": os.environ.get("TIER_FREE_MONTHLY_CAP_USD", ""),
    "HOBBY": os.environ.get("TIER_HOBBY_MONTHLY_CAP_USD", ""),
    "STANDARD": os.environ.get("TIER_STANDARD_MONTHLY_CAP_USD", ""),
    "PRO": os.environ.get("TIER_PRO_MONTHLY_CAP_USD", ""),
    "ULTRA": os.environ.get("TIER_ULTRA_MONTHLY_CAP_USD", ""),
}

SUBSCRIPTION_PERIOD_DAYS = int(os.environ.get("NEXUS_SUBSCRIPTION_PERIOD_DAYS", "30"))

# Анти-абьюз: не более X% месячного пула за календарные сутки UTC (0 = выкл.)
DAILY_ABUSE_CAP_FRACTION = float(os.environ.get("NEXUS_DAILY_ABUSE_CAP_FRACTION", "0"))

TIER_QUOTA_MARKETING = {
    "FREE": "Бесплатные модели OpenRouter · лимит запросов в сутки",
    "HOBBY": "~92% на ИИ · Flash · ориентир ChatGPT Go ($10)",
    "STANDARD": "~92% на ИИ · до Sonnet · ориентир Plus/Claude Pro ($20)",
    "PRO": "~92% на ИИ · полный Pro · ~5× пул Standard ($100)",
    "ULTRA": "~92% на ИИ · все модели · ~20× пул Standard ($200)",
}

# Бейдж на карточке тарифа (сравнение с рынком, без обещания чужих лимитов)
TIER_MARKET_BADGES = {
    "FREE": "",
    "HOBBY": "≈ ChatGPT Go",
    "STANDARD": "≈ Plus / Claude Pro",
    "PRO": "5× пул Standard",
    "ULTRA": "20× пул Standard",
}

MODEL_COSTS = {
    "deepseek/deepseek-v4-flash": {"input": 0.00000008, "output": 0.00000024},
}
DEFAULT_COST = {"input": 0.000001, "output": 0.000003}

# Email OTP (Resend)
RESEND_API_KEY = (os.environ.get("RESEND_API_KEY") or "").strip()
RESEND_FROM_EMAIL = (os.environ.get("RESEND_FROM_EMAIL") or "Nexus <onboarding@resend.dev>").strip()
AUTH_OTP_TTL_SEC = int(os.environ.get("AUTH_OTP_TTL_SEC", "600"))
AUTH_OTP_MAX_VERIFY_ATTEMPTS = int(os.environ.get("AUTH_OTP_MAX_VERIFY_ATTEMPTS", "5"))
AUTH_OTP_LOCK_MINUTES = int(os.environ.get("AUTH_OTP_LOCK_MINUTES", "15"))
AUTH_OTP_REQUEST_PER_EMAIL = int(os.environ.get("AUTH_OTP_REQUEST_PER_EMAIL", "3"))
AUTH_OTP_REQUEST_EMAIL_WINDOW_SEC = int(os.environ.get("AUTH_OTP_REQUEST_EMAIL_WINDOW_SEC", "900"))
AUTH_OTP_REQUEST_PER_IP = int(os.environ.get("AUTH_OTP_REQUEST_PER_IP", "10"))
AUTH_OTP_REQUEST_IP_WINDOW_SEC = int(os.environ.get("AUTH_OTP_REQUEST_IP_WINDOW_SEC", "3600"))
NEXUS_AUTH_DEV_LOG_CODES = os.environ.get("NEXUS_AUTH_DEV_LOG_CODES", "false").lower() in ("1", "true", "yes")

# Google OAuth
GOOGLE_CLIENT_ID = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()
GOOGLE_REDIRECT_URI = (os.environ.get("GOOGLE_REDIRECT_URI") or "").strip()
NEXUS_FRONTEND_URL = (os.environ.get("NEXUS_FRONTEND_URL") or "http://localhost:5173").strip().rstrip("/")

# Telegram bot (канал к аккаунту Nexus)
TELEGRAM_BOT_TOKEN = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
TELEGRAM_WEBHOOK_SECRET = (os.environ.get("TELEGRAM_WEBHOOK_SECRET") or "").strip()
TELEGRAM_BOT_USERNAME = (os.environ.get("TELEGRAM_BOT_USERNAME") or "NexusAiBot").strip().lstrip("@")
TELEGRAM_LINK_TTL_SEC = int(os.environ.get("TELEGRAM_LINK_TTL_SEC", "900"))
TELEGRAM_MSG_RATE_LIMIT = int(os.environ.get("TELEGRAM_MSG_RATE_LIMIT", "20"))
TELEGRAM_MSG_RATE_WINDOW_SEC = float(os.environ.get("TELEGRAM_MSG_RATE_WINDOW_SEC", "60"))


def telegram_bot_enabled() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


def telegram_login_domain() -> str:
    """Домен для Telegram Login Widget (должен совпадать с /setdomain в BotFather)."""
    explicit = (os.environ.get("TELEGRAM_LOGIN_DOMAIN") or "").strip().lower()
    if explicit:
        return explicit.lstrip(".")
    from urllib.parse import urlparse

    host = (urlparse(NEXUS_FRONTEND_URL).hostname or "").lower()
    return host
AUTH_EXCHANGE_CODE_TTL_SEC = int(os.environ.get("AUTH_EXCHANGE_CODE_TTL_SEC", "120"))

# ЮKassa — https://yookassa.ru/my/merchant/integration/api-keys
YOOKASSA_SHOP_ID = (os.environ.get("YOOKASSA_SHOP_ID") or "").strip()
YOOKASSA_SECRET_KEY = (os.environ.get("YOOKASSA_SECRET_KEY") or "").strip()
YOOKASSA_RETURN_PATH = (os.environ.get("YOOKASSA_RETURN_PATH") or "/pricing").strip()
OAUTH_STATE_TTL_SEC = int(os.environ.get("OAUTH_STATE_TTL_SEC", "600"))


def google_oauth_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


def email_auth_enabled() -> bool:
    """OTP на email. По умолчанию выкл., если настроен Google OAuth (прод без Resend-домена)."""
    raw = (os.environ.get("NEXUS_EMAIL_AUTH_ENABLED") or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return not google_oauth_configured()


# Connector OAuth (отдельно от входа Google)
GOOGLE_CONNECTOR_CLIENT_ID = (os.environ.get("GOOGLE_CONNECTOR_CLIENT_ID") or GOOGLE_CLIENT_ID).strip()
GOOGLE_CONNECTOR_CLIENT_SECRET = (
    os.environ.get("GOOGLE_CONNECTOR_CLIENT_SECRET") or GOOGLE_CLIENT_SECRET
).strip()
GOOGLE_CONNECTOR_REDIRECT_URI = (os.environ.get("GOOGLE_CONNECTOR_REDIRECT_URI") or "").strip()

GITHUB_CLIENT_ID = (os.environ.get("GITHUB_CLIENT_ID") or "").strip()
GITHUB_CLIENT_SECRET = (os.environ.get("GITHUB_CLIENT_SECRET") or "").strip()
GITHUB_REDIRECT_URI = (os.environ.get("GITHUB_REDIRECT_URI") or "").strip()

VERCEL_CLIENT_ID = (os.environ.get("VERCEL_CLIENT_ID") or "").strip()
VERCEL_CLIENT_SECRET = (os.environ.get("VERCEL_CLIENT_SECRET") or "").strip()
VERCEL_REDIRECT_URI = (os.environ.get("VERCEL_REDIRECT_URI") or "").strip()

NEXUS_CONNECTOR_CALLBACK_BASE = (os.environ.get("NEXUS_CONNECTOR_CALLBACK_BASE") or "").strip().rstrip("/")


def google_connector_oauth_configured() -> bool:
    return bool(
        GOOGLE_CONNECTOR_CLIENT_ID
        and GOOGLE_CONNECTOR_CLIENT_SECRET
        and GOOGLE_CONNECTOR_REDIRECT_URI
    )


def github_oauth_configured() -> bool:
    return bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET and GITHUB_REDIRECT_URI)


def vercel_oauth_configured() -> bool:
    return bool(VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET and VERCEL_REDIRECT_URI)


def oauth_allowed_redirect_bases() -> list[str]:
    """Origins allowed for Google OAuth return_to (scheme + host, no path)."""
    bases: list[str] = []
    for raw in (NEXUS_FRONTEND_URL, *_ADMIN_UI_ORIGINS, *NEXUS_CORS_ORIGINS):
        origin = (raw or "").strip().rstrip("/")
        if not origin or origin == "*":
            continue
        if origin not in bases:
            bases.append(origin)
    extra = (os.environ.get("NEXUS_OAUTH_REDIRECT_ORIGINS") or "").strip()
    if extra:
        for part in extra.split(","):
            o = part.strip().rstrip("/")
            if o and o not in bases:
                bases.append(o)
    return bases


def resend_configured() -> bool:
    return bool(RESEND_API_KEY)


NEXUS_SUPPORT_NOTIFY_EMAIL = (os.environ.get("NEXUS_SUPPORT_NOTIFY_EMAIL") or "").strip()


def yookassa_enabled() -> bool:
    return bool(YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


WEB_SEARCH_TARGET_SOURCES = _env_int("WEB_SEARCH_TARGET_SOURCES", 35)
WEB_SEARCH_MAX_SOURCES = _env_int("WEB_SEARCH_MAX_SOURCES", 60)
WEB_SEARCH_MAX_ROUNDS = _env_int("WEB_SEARCH_MAX_ROUNDS", 5)
WEB_SEARCH_SNIPPET_MAX_CHARS = _env_int("WEB_SEARCH_SNIPPET_MAX_CHARS", 400)
WEB_SEARCH_PROMPT_MAX_CHARS = _env_int("WEB_SEARCH_PROMPT_MAX_CHARS", 28000)
WEB_SEARCH_PER_QUERY_LIMIT = _env_int("WEB_SEARCH_PER_QUERY_LIMIT", 18)
WEB_SEARCH_DEEP_MAX_SOURCES = _env_int("WEB_SEARCH_DEEP_MAX_SOURCES", 80)
WEB_SEARCH_MAX_SECONDS = _env_int("WEB_SEARCH_MAX_SECONDS", 50)
WEB_SEARCH_CHAT_MAX_ROUNDS = _env_int("WEB_SEARCH_CHAT_MAX_ROUNDS", 3)
