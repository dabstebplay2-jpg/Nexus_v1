"""Отвязка Telegram/Google в админке."""

from app.database import UserDB
from app.services.admin_user_ops import admin_unlink_google, admin_unlink_telegram


def test_admin_unlink_telegram(db_session):
    user = UserDB(
        email="u@example.com",
        hashed_password="",
        telegram_id=12345,
        telegram_username="testuser",
        auth_methods="email_otp,telegram",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_u",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    admin_unlink_telegram(db_session, user)
    db_session.refresh(user)
    assert user.telegram_id is None
    assert user.telegram_username is None
    assert "telegram" not in (user.auth_methods or "")


def test_admin_unlink_google(db_session):
    user = UserDB(
        email="g@example.com",
        hashed_password="",
        google_sub="google-sub-12345678",
        auth_methods="google",
        subscription_tier="FREE",
        balance=0,
        refresh_token="ref_g",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    admin_unlink_google(db_session, user)
    db_session.refresh(user)
    assert user.google_sub is None
    assert "google" not in (user.auth_methods or "")
