import asyncio
import secrets

import pytest

from app.database import SessionLocal, UserDB, migrate_schema
from app.services import google_oauth as go


@pytest.fixture(scope="module", autouse=True)
def _migrate_schema():
    migrate_schema()


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_relink_stale_google_sub_when_email_verified(db):
    email = f"relink_{secrets.token_hex(4)}@example.com"
    real_sub = f"real_sub_{secrets.token_hex(8)}"
    stale_sub = "goog999new_stale"
    db.add(
        UserDB(
            email=email,
            hashed_password="",
            google_sub=stale_sub,
            subscription_tier="FREE",
            balance=0.0,
            refresh_token="ref_relink",
            auth_methods="google",
        )
    )
    db.commit()

    user = asyncio.run(
        go.find_or_create_google_user(
            db, google_sub=real_sub, email=email, email_verified=True
        )
    )
    assert user.google_sub == real_sub
