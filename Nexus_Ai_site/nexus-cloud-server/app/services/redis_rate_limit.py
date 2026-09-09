"""Optional Upstash-backed rate limits (shared across Render instances)."""

from __future__ import annotations

from app.config import UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL

_client = None


def _get_client():
    global _client
    if _client is None:
        from upstash_redis import Redis

        _client = Redis(url=UPSTASH_REDIS_REST_URL, token=UPSTASH_REDIS_REST_TOKEN)
    return _client


def redis_check_rate_limit(key: str, max_hits: int, window_sec: float) -> bool:
    """Fixed window counter. Returns True if allowed."""
    redis = _get_client()
    rk = f"nexus:rl:{key}"
    count = int(redis.incr(rk))
    if count == 1:
        redis.expire(rk, max(1, int(window_sec)))
    return count <= max_hits


def redis_retry_after_seconds(key: str, window_sec: float) -> int:
    redis = _get_client()
    rk = f"nexus:rl:{key}"
    ttl = redis.ttl(rk)
    if ttl is not None and int(ttl) > 0:
        return int(ttl)
    return max(1, int(window_sec))


def redis_is_locked_out(key: str) -> bool:
    redis = _get_client()
    return bool(redis.exists(f"nexus:lock:{key}"))


def redis_lockout_ttl(key: str) -> int:
    redis = _get_client()
    ttl = redis.ttl(f"nexus:lock:{key}")
    if ttl is not None and int(ttl) > 0:
        return int(ttl)
    return 0


def redis_record_failure(
    key: str,
    *,
    max_failures: int,
    window_sec: float,
    lockout_sec: float,
) -> None:
    redis = _get_client()
    fail_key = f"nexus:fail:{key}"
    count = int(redis.incr(fail_key))
    if count == 1:
        redis.expire(fail_key, max(1, int(window_sec)))
    if count >= max_failures:
        redis.set(f"nexus:lock:{key}", "1", ex=max(1, int(lockout_sec)))
        redis.delete(fail_key)


def redis_clear_failures(key: str) -> None:
    redis = _get_client()
    redis.delete(f"nexus:fail:{key}", f"nexus:lock:{key}")
