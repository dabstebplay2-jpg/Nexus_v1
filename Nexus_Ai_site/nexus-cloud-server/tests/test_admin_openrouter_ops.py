"""Admin OpenRouter: user summary, refresh, platform status."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.database import UserDB
from app.routers.local_admin import _user_summary
from app.services.admin_user_ops import admin_refresh_openrouter


def test_user_summary_includes_openrouter_fields(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "FREE"
    user.openrouter_api_key_encrypted = "enc-test"
    user.openrouter_key_hash = "hash-abcdefghijklmnop"
    user.openrouter_key_created_at = datetime(2026, 6, 7, 12, 0, 0)
    db_session.commit()

    summary = _user_summary(db_session, user)

    assert summary["has_openrouter_key"] is True
    assert summary["openrouter_ready"] is True
    assert summary["openrouter_key_hash_preview"] is not None
    assert "hash-" in summary["openrouter_key_hash_preview"]
    assert summary["openrouter_key_created_at"] is not None


@pytest.mark.asyncio
async def test_admin_refresh_openrouter_provisions_free_user(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "FREE"
    db_session.commit()

    with (
        patch(
            "app.services.admin_user_ops.openrouter_management_enabled",
            return_value=True,
        ),
        patch(
            "app.services.admin_user_ops.provision_openrouter_for_user",
            new_callable=AsyncMock,
            return_value=True,
        ) as provision_mock,
    ):
        ok = await admin_refresh_openrouter(db_session, user)

    assert ok is True
    provision_mock.assert_awaited_once()
    assert provision_mock.await_args.kwargs.get("force") is True


@pytest.mark.asyncio
async def test_admin_refresh_openrouter_skips_paid_tier(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "HOBBY"
    db_session.commit()

    ok = await admin_refresh_openrouter(db_session, user)
    assert ok is False


def test_analytics_summary_counts_openrouter_keys(db_session):
    from app.services.admin_analytics import analytics_summary

    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.openrouter_api_key_encrypted = "enc-test"
    db_session.commit()

    summary = analytics_summary(db_session)
    assert summary["users_with_openrouter_key"] == 1
