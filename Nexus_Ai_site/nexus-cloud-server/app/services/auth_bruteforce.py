"""Brute-force protection for password login, register, and admin API."""

from __future__ import annotations

from fastapi import HTTPException

from app.services.auth_rate_limit import (
    AUTH_LOCKOUT_SEC,
    check_rate_limit,
    clear_failures,
    is_locked_out,
    record_failure,
)

# Per-IP request throttle (in addition to failure lockout)
_LOGIN_IP_MAX = 30
_LOGIN_IP_WINDOW = 3600.0
_LOGIN_EMAIL_MAX = 15
_LOGIN_EMAIL_WINDOW = 900.0


def assert_login_allowed(email: str, ip: str | None, *, action: str = "login") -> None:
    scope = f"auth:{action}"
    if is_locked_out(scope, email, ip):
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток. Подождите {int(AUTH_LOCKOUT_SEC // 60)} минут.",
        )
    if not check_rate_limit(f"{scope}:ip:{ip or 'unknown'}", _LOGIN_IP_MAX, _LOGIN_IP_WINDOW):
        raise HTTPException(status_code=429, detail="Слишком много запросов с этого IP.")
    if not check_rate_limit(f"{scope}:email:{email}", _LOGIN_EMAIL_MAX, _LOGIN_EMAIL_WINDOW):
        raise HTTPException(status_code=429, detail="Слишком много попыток для этого email.")


def record_failed_login(email: str, ip: str | None, *, action: str = "login") -> None:
    record_failure(f"auth:{action}", email, ip)


def reset_login_attempts(email: str, ip: str | None, *, action: str = "login") -> None:
    clear_failures(f"auth:{action}", email, ip)


def assert_admin_not_locked_out(ip: str | None) -> None:
    """Только lockout после неверных паролей. Лимит 20 req/h снимаем — админка опрашивает API каждые 3 с."""
    if is_locked_out("admin", "password", ip):
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много попыток входа в админку. Подождите {int(AUTH_LOCKOUT_SEC // 60)} мин.",
        )


def assert_admin_login_allowed(ip: str | None) -> None:
    """@deprecated alias — use assert_admin_not_locked_out."""
    assert_admin_not_locked_out(ip)


def record_failed_admin(ip: str | None) -> None:
    record_failure("admin", "password", ip)


def reset_admin_attempts(ip: str | None) -> None:
    clear_failures("admin", "password", ip)
