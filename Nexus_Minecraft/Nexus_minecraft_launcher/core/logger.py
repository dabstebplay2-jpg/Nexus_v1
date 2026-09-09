import logging
import os
import platform
import re
import sys
from datetime import datetime

from storage.paths import LOGS_DIR, ensure_project_dirs


LATEST_LOG_FILE = LOGS_DIR / "latest.log"
SESSION_LOG_FILE = LOGS_DIR / f"launcher_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"


def redact_secret(value: str) -> str:
    if not value:
        return ""

    # скрывает логин/пароль в proxy: socks5://user:pass@host
    value = re.sub(r"//([^/@]+)@", "//***@", value)

    # на будущее, чтобы токены Microsoft не утекали в лог
    value = re.sub(r"access_token=([^&\s]+)", "access_token=***", value)
    value = re.sub(r"refresh_token=([^&\s]+)", "refresh_token=***", value)

    return value


def setup_logging():
    ensure_project_dirs()

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(threadName)s | %(message)s"
    )

    handlers = [
        logging.FileHandler(LATEST_LOG_FILE, mode="w", encoding="utf-8"),
        logging.FileHandler(SESSION_LOG_FILE, mode="a", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ]

    for handler in handlers:
        handler.setLevel(logging.DEBUG)
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)

    logging.getLogger("urllib3").setLevel(logging.INFO)

    logger = logging.getLogger("nexus")
    logger.info("Nexus Launcher started")
    logger.info("Latest log file: %s", LATEST_LOG_FILE)
    logger.info("Session log file: %s", SESSION_LOG_FILE)
    logger.info("Python executable: %s", sys.executable)
    logger.info("Python version: %s", sys.version)
    logger.info("Platform: %s", platform.platform())
    logger.info("Working directory: %s", os.getcwd())

    proxy_names = [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "NO_PROXY",
        "no_proxy",
    ]

    for name in proxy_names:
        value = os.environ.get(name)
        if value:
            logger.warning("ENV %s=%s", name, redact_secret(value))

    return logger


def get_latest_log_path():
    return str(LATEST_LOG_FILE)