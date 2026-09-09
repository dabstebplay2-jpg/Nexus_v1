import os

import pytest

# Safe defaults before app import
os.environ["NEXUS_SKIP_DOTENV"] = "true"
os.environ.setdefault("NEXUS_CLOUD_SECRET_KEY", "test-secret-key-32-characters-long!!")
os.environ.setdefault("NEXUS_TESTING_MODE", "false")
os.environ.setdefault("NEXUS_BILLING_TEST_MODE", "false")
os.environ.setdefault("NEXUS_AUTH_DEV_LOG_CODES", "false")
os.environ.pop("RENDER", None)
os.environ.pop("RENDER_SERVICE_ID", None)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.database import Base, UserDB

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(UserDB(id=1, email="test@example.com", hashed_password="x"))
    db.commit()
    try:
        yield db
    finally:
        db.close()
