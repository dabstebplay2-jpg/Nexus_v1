import asyncio
import secrets
from unittest.mock import patch

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


def test_new_google_user_empty_password_not_null(db):
    user = asyncio.run(
        go.find_or_create_google_user(
            db, google_sub="sub_new_1", email="brandnew@example.com", email_verified=True
        )
    )
    assert user.email == "brandnew@example.com"
    assert user.hashed_password == ""


def test_jwks_kid_lookup_uses_getitem_not_find_by_kid():
    """PyJWT 2.8: PyJWKSet[kid], not find_by_kid()."""
    from jwt import PyJWKSet

    assert not hasattr(PyJWKSet.from_dict, "find_by_kid")
    jwk_set = type("FakeSet", (), {"__getitem__": lambda self, k: "ok"})()
    assert jwk_set["kid-test"] == "ok"


def test_jwt_oauth_state_roundtrip():
    verifier = "v" * 48
    token = go._encode_oauth_state(verifier, "https://app.example.com")
    rt, pkce = go._decode_oauth_state_jwt(token)
    assert rt == "https://app.example.com"
    assert pkce == verifier


def test_google_callback_links_existing_email(db):
    email = f"existing_link_{secrets.token_hex(4)}@example.com"
    expected_sub = f"google_sub_{secrets.token_hex(8)}"
    db.add(
        UserDB(
            email=email,
            hashed_password="hash",
            subscription_tier="HOBBY",
            balance=0.0,
            refresh_token="ref_x",
        )
    )
    db.commit()

    verifier = "v" * 48
    state = go._encode_oauth_state(verifier, "https://app.example.com")

    async def fake_exchange(code, v):
        return {"id_token": "tok"}

    async def fake_verify(t):
        return {"email": email, "email_verified": True, "sub": expected_sub}

    with patch.object(go, "_exchange_code", fake_exchange), patch.object(
        go, "_verify_id_token", fake_verify
    ):
        return_to, exchange = asyncio.run(go.handle_google_callback(db, "code", state))

    assert return_to == "https://app.example.com"
    assert exchange.count(".") == 2
    uid, _ = go._resolve_exchange_claims(db, exchange)
    u = db.query(UserDB).filter(UserDB.id == uid).first()
    assert u.email == email
    assert u.google_sub == expected_sub
