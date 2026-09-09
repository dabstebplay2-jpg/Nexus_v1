"""Polza: один ключ на email, выдача только после оплаты."""

from unittest.mock import AsyncMock, patch

import pytest

from app.database import UserDB
from app.services.polza import (
    polza_key_name_for_email,
    provision_polza_for_user,
    suspend_polza_for_user,
    user_has_polza_key,
)
from app.services.polza_mcp import delete_polza_keys_by_name, find_polza_keys_by_name


def test_polza_key_name_for_email_stable():
    assert polza_key_name_for_email("User@Example.COM") == "nexus-user@example.com"
    assert polza_key_name_for_email("user@example.com") == "nexus-user@example.com"


@pytest.mark.asyncio
async def test_find_polza_keys_by_name_case_insensitive():
    rows = [
        {"id": "k1", "name": "nexus-user@example.com"},
        {"id": "k2", "name": "NEXUS-USER@EXAMPLE.COM"},
        {"id": "k3", "name": "other"},
    ]
    with patch("app.services.polza_mcp.mcp_list_api_keys", new_callable=AsyncMock, return_value=rows):
        found = await find_polza_keys_by_name("nexus-user@example.com")
    assert len(found) == 2
    assert {r["id"] for r in found} == {"k1", "k2"}


@pytest.mark.asyncio
async def test_delete_polza_keys_by_name():
    rows = [
        {"id": "k1", "name": "nexus-user@example.com"},
        {"id": "k2", "name": "nexus-user@example.com"},
    ]
    with patch("app.services.polza_mcp.mcp_list_api_keys", new_callable=AsyncMock, return_value=rows):
        with patch(
            "app.services.polza_mcp.mcp_delete_api_key",
            new_callable=AsyncMock,
            return_value=True,
        ) as delete_mock:
            deleted = await delete_polza_keys_by_name("nexus-user@example.com")
    assert deleted == 2
    assert delete_mock.await_count == 2


@pytest.mark.asyncio
async def test_provision_skips_create_when_key_in_db(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "STANDARD"
    from app.services.credentials_vault import encrypt_secret

    user.polza_api_key_encrypted = encrypt_secret("pza_existing_key_abcdefghij")
    user.polza_key_id = "pk-existing"
    db_session.commit()

    with patch("app.services.polza.POLZA_MCP_TOKEN", "test-token"):
        with patch(
            "app.services.polza.mcp_create_api_key",
            new_callable=AsyncMock,
        ) as create_mock:
            with patch(
                "app.services.polza.sync_polza_key_limit_after_payment",
                new_callable=AsyncMock,
                return_value=True,
            ) as sync_mock:
                ok = await provision_polza_for_user(user, db_session, pool_rub=500.0, force=False)

    assert ok is True
    create_mock.assert_not_awaited()
    sync_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_provision_cleans_up_before_create(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "STANDARD"
    db_session.commit()

    with patch("app.services.polza.POLZA_MCP_TOKEN", "test-token"):
        with patch(
            "app.services.polza.delete_polza_keys_for_email",
            new_callable=AsyncMock,
            return_value=3,
        ) as cleanup_mock:
            with patch(
                "app.services.polza.mcp_create_api_key",
                new_callable=AsyncMock,
                return_value={"id": "pk-new", "rawKey": "pza_new_key_abcdefghijklmnop"},
            ) as create_mock:
                ok = await provision_polza_for_user(user, db_session, pool_rub=920.0, force=False)

    assert ok is True
    cleanup_mock.assert_awaited_once_with(user.email)
    create_mock.assert_awaited_once()
    args, kwargs = create_mock.await_args
    assert kwargs["name"] == polza_key_name_for_email(user.email)
    assert kwargs["amount_rub"] == 920.0
    db_session.refresh(user)
    assert user_has_polza_key(user)
    assert user.polza_key_id == "pk-new"


@pytest.mark.asyncio
async def test_suspend_deletes_remote_key(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    from app.services.credentials_vault import encrypt_secret

    user.polza_api_key_encrypted = encrypt_secret("pza_to_delete_abcdefghijklmnop")
    user.polza_key_id = "pk-del"
    db_session.commit()

    with patch(
        "app.services.polza.mcp_delete_api_key",
        new_callable=AsyncMock,
        return_value=True,
    ) as delete_mock:
        with patch(
            "app.services.polza.delete_polza_keys_for_email",
            new_callable=AsyncMock,
            return_value=0,
        ):
            await suspend_polza_for_user(user, db_session)

    delete_mock.assert_awaited()
    db_session.refresh(user)
    assert not user_has_polza_key(user)


@pytest.mark.asyncio
async def test_issue_tokens_does_not_provision(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "STANDARD"
    db_session.commit()

    with patch(
        "app.services.auth_session.enforce_paid_subscription",
        new_callable=AsyncMock,
        return_value=True,
    ):
        with patch(
            "app.services.polza.provision_polza_for_user",
            new_callable=AsyncMock,
        ) as provision_mock:
            from app.services.auth_session import issue_tokens_and_setup

            await issue_tokens_and_setup(db_session, user)

    provision_mock.assert_not_awaited()
