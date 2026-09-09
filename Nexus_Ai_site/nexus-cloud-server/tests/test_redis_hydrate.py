"""Redis hydrate must not wipe PostgreSQL."""

from unittest.mock import patch

from app.services import redis_sync as rs


def test_hydrate_skips_postgresql():
    with (
        patch.object(rs, "redis_persistence_enabled", return_value=True),
        patch("app.config.database_backend", return_value="postgresql"),
        patch.object(rs, "_redis_get") as mock_get,
    ):
        assert rs.hydrate_from_redis() == 0
        mock_get.assert_not_called()
