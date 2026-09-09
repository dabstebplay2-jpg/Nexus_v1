"""Redis snapshot round-trip includes Polza credentials."""

from datetime import datetime

from app.database import UserDB, WorkspaceDB
from app.services.redis_sync import export_snapshot, import_snapshot


def test_user_snapshot_roundtrip_preserves_polza_fields(db_session):
    db = db_session
    user = db.query(UserDB).filter(UserDB.id == 1).one()
    user.subscription_tier = "STANDARD"
    user.polza_api_key_encrypted = "enc:pza_test"
    user.polza_user_id = "pu-1"
    user.polza_key_id = "pk-1"
    user.polza_key_updated_at = datetime(2026, 6, 5, 12, 0, 0)
    user.polza_connect_required = 0
    user.openrouter_api_key_encrypted = "enc:sk-or-test"
    user.openrouter_key_hash = "or-hash-1"
    user.openrouter_key_created_at = datetime(2026, 6, 6, 10, 0, 0)
    db.add(
        WorkspaceDB(
            user_id=user.id,
            workspace_id="ws-snapshot",
            name="Снимок проекта",
            emoji="🧪",
        )
    )
    db.commit()

    payload = export_snapshot(db)
    assert payload["v"] == 5
    polza_row = payload["users"][0]
    assert polza_row["polza_api_key_encrypted"] == "enc:pza_test"
    assert polza_row["polza_key_id"] == "pk-1"
    assert polza_row["openrouter_api_key_encrypted"] == "enc:sk-or-test"
    assert polza_row["openrouter_key_hash"] == "or-hash-1"
    assert payload["workspaces"][0]["workspace_id"] == "ws-snapshot"

    import_snapshot(db, payload)
    restored = db.query(UserDB).filter(UserDB.id == 1).one()
    assert restored.polza_api_key_encrypted == "enc:pza_test"
    assert restored.polza_user_id == "pu-1"
    assert restored.polza_key_id == "pk-1"
    assert restored.polza_key_updated_at == datetime(2026, 6, 5, 12, 0, 0)
    assert restored.openrouter_api_key_encrypted == "enc:sk-or-test"
    assert restored.openrouter_key_hash == "or-hash-1"
    assert restored.openrouter_key_created_at == datetime(2026, 6, 6, 10, 0, 0)
    restored_workspace = db.query(WorkspaceDB).filter(WorkspaceDB.user_id == restored.id).one()
    assert restored_workspace.name == "Снимок проекта"
    assert restored_workspace.emoji == "🧪"


def test_user_from_dict_v1_snapshot_without_polza_defaults_none(db_session):
    db = db_session
    legacy = {
        "id": 2,
        "email": "legacy@example.com",
        "subscription_tier": "FREE",
        "balance": 0,
    }
    import_snapshot(db, {"v": 1, "users": [legacy], "transactions": [], "invoices": []})
    restored = db.query(UserDB).filter(UserDB.email == "legacy@example.com").one()
    assert restored.polza_api_key_encrypted is None
    assert restored.polza_key_id is None
    assert restored.openrouter_api_key_encrypted is None
    assert restored.openrouter_key_hash is None
