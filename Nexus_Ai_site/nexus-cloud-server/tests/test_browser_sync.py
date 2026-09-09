"""Browser sync API."""

import pytest
from fastapi.testclient import TestClient

from app.database import BrowserSyncDB, UserDB
from app.main import app
from app.security import create_access_token


@pytest.fixture
def client(db_session):
    from app.database import get_db

    def _override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _auth_headers(db_session):
    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}


def test_browser_sync_roundtrip(client, db_session):
    headers = _auth_headers(db_session)
    put_body = {
        "payload": {
            "version": 1,
            "settings": {"theme": "dark", "accentColor": "#3b82f6"},
            "ntpShortcuts": [{"id": "a", "name": "Test", "url": "https://example.com"}],
            "bookmarks": [{"url": "https://example.com", "title": "Ex"}],
            "updatedAt": 1000,
        },
        "client_version": "0.2.1",
    }
    res = client.put("/v1/user/browser-sync", json=put_body, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["payload"]["settings"]["theme"] == "dark"
    assert data["updated_at"]

    res2 = client.get("/v1/user/browser-sync", headers=headers)
    assert res2.status_code == 200
    got = res2.json()
    assert got["payload"]["ntpShortcuts"][0]["name"] == "Test"

    row = db_session.query(BrowserSyncDB).first()
    assert row is not None
    assert "example.com" in row.payload_json


def test_browser_sync_v2_payload(client, db_session):
    headers = _auth_headers(db_session)
    put_body = {
        "payload": {
            "version": 2,
            "settings": {"syncHistory": True, "syncTabs": True},
            "ntpShortcuts": [],
            "bookmarks": [],
            "history": [
                {
                    "url": "https://youtube.com",
                    "title": "YouTube",
                    "visitedAt": 2000,
                    "visitCount": 3,
                }
            ],
            "chatSessions": {
                "https://example.com": [
                    {"id": "m1", "role": "user", "content": "hi", "timestamp": 1}
                ]
            },
            "tabSession": {
                "tabs": [{"url": "https://example.com", "title": "Ex", "pinned": False}],
                "activeIndex": 0,
                "deviceLabel": "pc-a",
                "updatedAt": 3000,
            },
            "updatedAt": 3000,
        },
        "client_version": "0.3.0",
    }
    res = client.put("/v1/user/browser-sync", json=put_body, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["payload"]["history"][0]["visitCount"] == 3
    assert data["payload"]["tabSession"]["deviceLabel"] == "pc-a"
