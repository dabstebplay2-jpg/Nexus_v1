"""Support tickets API."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import UserDB
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


def test_create_support_ticket(client, db_session):
    headers = _auth_headers(db_session)
    with patch(
        "app.routers.support.notify_admin_new_ticket",
        new_callable=AsyncMock,
    ):
        res = client.post(
            "/v1/support/tickets",
            headers=headers,
            json={
                "category": "complaint",
                "subject": "Тестовая тема",
                "body": "Текст обращения",
                "attachments": [],
            },
        )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["id"]
    assert data["category"] == "complaint"
    assert len(data["messages"]) == 1


def test_list_support_tickets(client, db_session):
    headers = _auth_headers(db_session)
    with patch("app.routers.support.notify_admin_new_ticket", new_callable=AsyncMock):
        created = client.post(
            "/v1/support/tickets",
            headers=headers,
            json={"category": "question", "subject": "Вопрос", "body": "Текст", "attachments": []},
        )
    assert created.status_code == 200, created.text
    res = client.get("/v1/support/tickets", headers=headers)
    assert res.status_code == 200
    assert len(res.json().get("tickets") or []) >= 1


def test_rejects_non_image_data_url_attachment(client, db_session):
    headers = _auth_headers(db_session)
    res = client.post(
        "/v1/support/tickets",
        headers=headers,
        json={
            "category": "bug",
            "subject": "Attachment validation",
            "body": "Invalid image MIME type must not be stored.",
            "attachments": [
                {
                    "kind": "image",
                    "name": "payload.html",
                    "mime": "text/html",
                    "data_base64": "PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
                }
            ],
        },
    )
    assert res.status_code == 400
