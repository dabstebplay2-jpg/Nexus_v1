import pytest
from fastapi.testclient import TestClient

from app.database import ChatConversationDB, UserDB, WorkspaceDB
from app.main import app
from app.security import create_access_token


@pytest.fixture
def client(db_session):
    from app.database import get_db

    def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _headers(email: str = "test@example.com") -> dict[str, str]:
    token = create_access_token({"sub": email})
    return {"Authorization": f"Bearer {token}"}


def _payload(name: str = "Проект", chat_id: str = "space_chat_001") -> dict:
    return {
        "workspaces": [
            {
                "id": "ws_default",
                "name": name,
                "emoji": "🚀",
                "createdAt": 1_720_000_000_000,
                "updatedAt": 1_720_000_100_000,
            }
        ],
        "conversations": [
            {
                "id": chat_id,
                "workspaceId": "ws_default",
                "title": "План релиза",
                "model": "test/model",
                "messages": [{"role": "user", "content": "Составь план"}],
                "createdAt": 1_720_000_000_000,
                "updatedAt": 1_720_000_100_000,
            }
        ],
    }


def test_space_state_sync_roundtrip(client, db_session):
    response = client.put("/v1/spaces/sync", headers=_headers(), json=_payload())
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["workspaces"][0]["name"] == "Проект"
    assert data["conversations"][0]["workspaceId"] == "ws_default"

    listed = client.get("/v1/spaces", headers=_headers())
    assert listed.status_code == 200
    assert listed.json()["conversations"][0]["title"] == "План релиза"
    assert db_session.query(WorkspaceDB).count() == 1
    assert db_session.query(ChatConversationDB).filter(ChatConversationDB.workspace_id.isnot(None)).count() == 1


def test_space_sync_propagates_deletions(client, db_session):
    first = client.put("/v1/spaces/sync", headers=_headers(), json=_payload())
    assert first.status_code == 200

    deleted = client.put(
        "/v1/spaces/sync",
        headers=_headers(),
        json={"workspaces": [], "conversations": []},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {"workspaces": [], "conversations": []}
    assert db_session.query(WorkspaceDB).count() == 0
    assert db_session.query(ChatConversationDB).filter(ChatConversationDB.workspace_id.isnot(None)).count() == 0


def test_same_workspace_id_is_isolated_between_users(client, db_session):
    db_session.add(UserDB(id=2, email="second@example.com", hashed_password="x"))
    db_session.commit()

    first = client.put("/v1/spaces/sync", headers=_headers(), json=_payload("Первый"))
    second = client.put(
        "/v1/spaces/sync",
        headers=_headers("second@example.com"),
        json=_payload("Второй", "space_chat_002"),
    )
    assert first.status_code == 200
    assert second.status_code == 200, second.text
    assert db_session.query(WorkspaceDB).count() == 2

    first_list = client.get("/v1/spaces", headers=_headers()).json()
    second_list = client.get("/v1/spaces", headers=_headers("second@example.com")).json()
    assert first_list["workspaces"][0]["name"] == "Первый"
    assert second_list["workspaces"][0]["name"] == "Второй"
