"""Rate limits for auth (in-memory per process; Upstash when configured)."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from threading import Lock

from app.config import redis_persistence_enabled

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    def __init__(self, message: str, retry_after_seconds: int):
        self.message = message
        self.retry_after_seconds = max(1, int(retry_after_seconds))
        super().__init__(message)

_lock = Lock()
_buckets: dict[str, list[float]] = defaultdict(list)

# Failures before lockout (login/register/admin password)
AUTH_FAIL_MAX = 10
AUTH_FAIL_WINDOW_SEC = 900.0
AUTH_LOCKOUT_SEC = 900.0

_fail_counts: dict[str, list[float]] = defaultdict(list)
_lockouts: dict[str, float] = {}


def _prune(key: str, window_sec: float, store: dict[str, list[float]]) -> None:
    cutoff = time.time() - window_sec
    store[key] = [t for t in store[key] if t > cutoff]


def _check_rate_limit_memory(key: str, max_hits: int, window_sec: float) -> bool:
    with _lock:
        _prune(key, window_sec, _buckets)
        if len(_buckets[key]) >= max_hits:
            return False
        _buckets[key].append(time.time())
        return True


def check_rate_limit(key: str, max_hits: int, window_sec: float) -> bool:
    """Return True if allowed, False if rate limited."""
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_check_rate_limit

            return redis_check_rate_limit(key, max_hits, window_sec)
        except Exception as exc:
            logger.warning("Redis rate limit fallback to memory: %s", exc)

    return _check_rate_limit_memory(key, max_hits, window_sec)


async def check_rate_limit_async(key: str, max_hits: int, window_sec: float) -> bool:
    """Async-safe rate limit (Redis in thread + 5s timeout)."""
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_check_rate_limit

            return await asyncio.wait_for(
                asyncio.to_thread(redis_check_rate_limit, key, max_hits, window_sec),
                timeout=5.0,
            )
        except Exception as exc:
            logger.warning("Redis rate limit fallback to memory: %s", exc)

    return _check_rate_limit_memory(key, max_hits, window_sec)


def _retry_after_memory(key: str, window_sec: float) -> int:
    with _lock:
        _prune(key, window_sec, _buckets)
        if not _buckets[key]:
            return max(1, int(window_sec))
        oldest = min(_buckets[key])
        return max(1, int(oldest + window_sec - time.time()))


def get_retry_after_seconds(key: str, window_sec: float) -> int:
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_retry_after_seconds

            return redis_retry_after_seconds(key, window_sec)
        except Exception as exc:
            logger.warning("Redis retry-after fallback to memory: %s", exc)
    return _retry_after_memory(key, window_sec)


async def get_retry_after_seconds_async(key: str, window_sec: float) -> int:
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_retry_after_seconds

            return await asyncio.wait_for(
                asyncio.to_thread(redis_retry_after_seconds, key, window_sec),
                timeout=5.0,
            )
        except Exception as exc:
            logger.warning("Redis retry-after fallback to memory: %s", exc)
    return _retry_after_memory(key, window_sec)


async def assert_rate_limit_async(
    key: str,
    max_hits: int,
    window_sec: float,
    message: str,
) -> None:
    if await check_rate_limit_async(key, max_hits, window_sec):
        return
    retry = await get_retry_after_seconds_async(key, window_sec)
    raise RateLimitExceeded(message, retry)


def _lockout_key(scope: str, identifier: str, ip: str | None) -> str:
    ip_part = (ip or "unknown").strip()
    return f"{scope}:{identifier}:{ip_part}"


def is_locked_out(scope: str, identifier: str, ip: str | None) -> bool:
    key = _lockout_key(scope, identifier, ip)
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_is_locked_out

            return redis_is_locked_out(key)
        except Exception as exc:
            logger.warning("Redis lockout fallback to memory: %s", exc)
    with _lock:
        until = _lockouts.get(key)
        if until and until > time.time():
            return True
        if until:
            _lockouts.pop(key, None)
        return False


def record_failure(scope: str, identifier: str, ip: str | None) -> None:
    key = _lockout_key(scope, identifier, ip)
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_record_failure

            redis_record_failure(
                key,
                max_failures=AUTH_FAIL_MAX,
                window_sec=AUTH_FAIL_WINDOW_SEC,
                lockout_sec=AUTH_LOCKOUT_SEC,
            )
            return
        except Exception as exc:
            logger.warning("Redis failure counter fallback to memory: %s", exc)
    with _lock:
        _prune(key, AUTH_FAIL_WINDOW_SEC, _fail_counts)
        _fail_counts[key].append(time.time())
        if len(_fail_counts[key]) >= AUTH_FAIL_MAX:
            _lockouts[key] = time.time() + AUTH_LOCKOUT_SEC
            _fail_counts[key].clear()


def clear_failures(scope: str, identifier: str, ip: str | None) -> None:
    key = _lockout_key(scope, identifier, ip)
    if redis_persistence_enabled():
        try:
            from app.services.redis_rate_limit import redis_clear_failures

            redis_clear_failures(key)
        except Exception as exc:
            logger.warning("Redis clear failures fallback to memory: %s", exc)
    with _lock:
        _fail_counts.pop(key, None)
        _lockouts.pop(key, None)
