"""Привязка Telegram: отбор у ошибочного shadow-аккаунта."""

from app.database import UserDB
from app.services.telegram_link import (
    attach_telegram_to_user,
    create_link_token,
    is_reclaimable_tg_shadow,
    link_telegram_account,
)


def test_is_reclaimable_tg_shadow():
    u = UserDB(email="tg123@tg.nexus", telegram_id=123, subscription_tier="FREE", balance=0)
    assert is_reclaimable_tg_shadow(u) is True
    u.subscription_tier = "HOBBY"
    assert is_reclaimable_tg_shadow(u) is False


def test_link_steals_telegram_from_shadow(db_session, monkeypatch):
    monkeypatch.setattr("app.services.telegram_link.redis_persistence_enabled", lambda: False)

    shadow = UserDB(
        email="tg999@tg.nexus",
        hashed_password="",
        telegram_id=999,
        telegram_username="dabsteb2",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_shadow",
    )
    main = UserDB(
        email="user@gmail.com",
        hashed_password="",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_main",
        auth_methods="email_otp",
    )
    db_session.add_all([shadow, main])
    db_session.commit()

    token, _ = create_link_token(main.id)
    linked = link_telegram_account(
        db_session,
        token=token,
        telegram_id=999,
        telegram_username="dabsteb2",
    )
    assert linked.id == main.id
    assert linked.telegram_id == 999
    assert linked.telegram_username == "dabsteb2"

    db_session.refresh(shadow)
    assert shadow.telegram_id is None


def test_attach_telegram_to_user_reclaims(db_session):
    shadow = UserDB(
        email="tg555@tg.nexus",
        hashed_password="",
        telegram_id=555,
        telegram_username="tguser",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_s",
    )
    main = UserDB(
        email="main@example.com",
        hashed_password="",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_m",
    )
    db_session.add_all([shadow, main])
    db_session.commit()

    out = attach_telegram_to_user(
        db_session,
        target=main,
        telegram_id=555,
        telegram_username="tguser",
    )
    assert out.telegram_id == 555
    db_session.refresh(shadow)
    assert shadow.telegram_id is None
