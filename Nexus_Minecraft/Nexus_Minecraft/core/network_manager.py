import logging
import os

from core.logger import redact_secret

logger = logging.getLogger(__name__)


PROXY_ENV_KEYS = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
]


def log_proxy_environment():
    found_proxy = False

    for key in PROXY_ENV_KEYS:
        value = os.environ.get(key)

        if value:
            found_proxy = True
            logger.warning("Proxy env detected: %s=%s", key, redact_secret(value))

    if not found_proxy:
        logger.info("No proxy environment variables detected")


def disable_proxy_for_launcher():
    logger.info("Setting NO_PROXY=* while preserving existing proxy environment variables")

    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"

    for key in PROXY_ENV_KEYS:
        value = os.environ.get(key)

        if value:
            logger.info("Proxy env preserved: %s=%s", key, redact_secret(value))

    logger.info("Proxy variables preserved, NO_PROXY=* ensures they are bypassed")