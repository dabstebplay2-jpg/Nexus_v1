"""Admin revoke/delete uses Polza, not legacy RouterAI-only paths."""

from unittest.mock import AsyncMock, patch

import pytest

from app.database import UserDB
from app.services.admin_user_ops import admin_delete_user, admin_revoke_tier


@pytest.mark.asyncio
async def test_admin_revoke_tier_suspends_polza(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "STANDARD"
    user.polza_key_id = "pk-test"
    db_session.commit()

    with patch(
        "app.services.admin_user_ops.suspend_polza_for_user",
        new_callable=AsyncMock,
    ) as suspend_mock:
        await admin_revoke_tier(db_session, user)

    suspend_mock.assert_awaited_once()
    db_session.refresh(user)
    assert user.subscription_tier == "FREE"


@pytest.mark.asyncio
async def test_admin_delete_user_deletes_polza_key(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.polza_key_id = "pk-delete-me"
    db_session.commit()
    uid = user.id

    with patch(
        "app.services.admin_user_ops.mcp_delete_api_key",
        new_callable=AsyncMock,
        return_value=True,
    ) as delete_mock:
        await admin_delete_user(db_session, user)

    delete_mock.assert_awaited_once_with(key_id="pk-delete-me")
    assert db_session.query(UserDB).filter(UserDB.id == uid).first() is None
