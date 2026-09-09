"""Fail-fast checks for production (Render / explicit ENV=production)."""

from __future__ import annotations

import logging
import os

from app.config import (
    NEXUS_ADMIN_PASSWORD,
    NEXUS_AUTH_DEV_LOG_CODES,
    NEXUS_BILLING_TEST_MODE,
    NEXUS_CORS_ORIGINS,
    NEXUS_REMOTE_ADMIN,
    NEXUS_TESTING_MODE,
    POLZA_BACKEND_API_KEY,
    POLZA_MCP_TOKEN,
    SECRET_KEY,
    database_is_ephemeral,
    is_render_host,
)

logger = logging.getLogger(__name__)

_DEFAULT_SECRET_MARKERS = (
    "SUPER_SECRET_NEXUS_KEY_CHANGE_THIS_IN_PRODUCTION",
    "change-me-in-production",
    "change-me",
    "nexus-dev-change-me-in-production",
)


def is_production_environment() -> bool:
    env = (os.environ.get("ENV") or os.environ.get("NEXUS_ENV") or "").strip().lower()
    if env in ("production", "prod"):
        return True
    return is_render_host()


def _secret_is_weak(secret: str) -> bool:
    s = (secret or "").strip()
    if len(s) < 32:
        return True
    lower = s.lower()
    return any(m.lower() in lower for m in _DEFAULT_SECRET_MARKERS)


def assert_production_config() -> None:
    """Raises SystemExit if unsafe settings are detected on production hosts."""
    if not is_production_environment():
        return

    errors: list[str] = []

    if NEXUS_TESTING_MODE:
        errors.append("NEXUS_TESTING_MODE must be false in production")
    if NEXUS_BILLING_TEST_MODE:
        errors.append("NEXUS_BILLING_TEST_MODE must be false in production")
    if NEXUS_AUTH_DEV_LOG_CODES:
        errors.append("NEXUS_AUTH_DEV_LOG_CODES must be false in production")
    if _secret_is_weak(SECRET_KEY):
        errors.append(
            "NEXUS_CLOUD_SECRET_KEY is missing, too short (<32), or uses a default placeholder"
        )
    if not NEXUS_CORS_ORIGINS or "*" in NEXUS_CORS_ORIGINS:
        errors.append("NEXUS_CORS_ORIGINS must list explicit frontend origins (no wildcard)")
    if database_is_ephemeral():
        errors.append(
            "Database is ephemeral (SQLite on Render without Postgres/Upstash). "
            "Set NEXUS_CLOUD_DATABASE_URL to PostgreSQL or configure Upstash Redis."
        )
    if NEXUS_REMOTE_ADMIN:
        if not NEXUS_ADMIN_PASSWORD:
            errors.append("NEXUS_ADMIN_PASSWORD is required when NEXUS_REMOTE_ADMIN=true")
        elif len(NEXUS_ADMIN_PASSWORD) < 12:
            errors.append("NEXUS_ADMIN_PASSWORD is too short for production (min 12 characters)")
    if not (POLZA_MCP_TOKEN or "").strip():
        errors.append("POLZA_MCP_TOKEN is required in production (Polza MCP autoprovision)")
    if not (POLZA_BACKEND_API_KEY or "").strip():
        errors.append("POLZA_BACKEND_API_KEY is required in production")

    if errors:
        for msg in errors:
            logger.critical("Production config: %s", msg)
        raise SystemExit(
            "Refusing to start: unsafe production configuration. "
            "See docs/SECURITY_ROTATION_RU.md and docs/DEPLOYMENT_RU.md"
        )
