"""UTC time helpers that preserve the database's existing naive UTC format."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time without tzinfo for legacy DateTime columns."""
    return datetime.now(UTC).replace(tzinfo=None)
