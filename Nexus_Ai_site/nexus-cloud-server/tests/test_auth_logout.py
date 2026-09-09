"""Auth logout invalidates refresh token."""

from fastapi.testclient import TestClient

from app.database import UserDB
from app.main import app
from app.security import create_access_token


def test_logout_clears_refresh_token(client, db_session):
    from app.database import get_db

    user = db_session.query(UserDB).filter(UserDB.id == 1).one()
    user.refresh_token = "ref_before_logout"
    db_session.commit()

    def _override():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override
    token = create_access_token({"sub": user.email})
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app) as c:
        res = c.post("/v1/auth/logout", headers=headers)
        assert res.status_code == 200, res.text
        db_session.refresh(user)
        assert user.refresh_token is None

        refresh = c.post("/v1/auth/refresh", json={"refresh_token": "ref_before_logout"})
        assert refresh.status_code == 401

    app.dependency_overrides.clear()
