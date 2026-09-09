import pytest

from app.production_guard import assert_production_config, is_production_environment


def test_not_production_by_default(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)
    monkeypatch.setenv("ENV", "development")
    assert is_production_environment() is False
    assert_production_config()  # should not raise


def _prod_env(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("NEXUS_TESTING_MODE", "false")
    monkeypatch.setenv("NEXUS_BILLING_TEST_MODE", "false")
    monkeypatch.setenv("NEXUS_AUTH_DEV_LOG_CODES", "false")
    monkeypatch.setenv("NEXUS_CLOUD_SECRET_KEY", "test-secret-key-32-characters-long!!")
    monkeypatch.setenv("NEXUS_CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("NEXUS_CLOUD_DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("POLZA_BACKEND_API_KEY", "pza-test-backend-key")
    monkeypatch.setenv("POLZA_MCP_TOKEN", "pza-test-mcp-token")


def _reload_prod_modules(monkeypatch):
    from importlib import reload

    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)

    import app.config as cfg
    import app.production_guard as pg

    reload(cfg)
    reload(pg)
    return pg


def test_production_blocks_testing_mode(monkeypatch):
    _prod_env(monkeypatch)
    monkeypatch.setenv("NEXUS_TESTING_MODE", "true")

    pg = _reload_prod_modules(monkeypatch)

    with pytest.raises(SystemExit):
        pg.assert_production_config()


def test_production_blocks_missing_polza_keys(monkeypatch):
    _prod_env(monkeypatch)
    monkeypatch.delenv("POLZA_MCP_TOKEN", raising=False)
    monkeypatch.delenv("POLZA_BACKEND_API_KEY", raising=False)

    pg = _reload_prod_modules(monkeypatch)

    with pytest.raises(SystemExit):
        pg.assert_production_config()


def test_production_blocks_dev_otp_logging(monkeypatch):
    _prod_env(monkeypatch)
    monkeypatch.setenv("NEXUS_AUTH_DEV_LOG_CODES", "true")

    pg = _reload_prod_modules(monkeypatch)

    with pytest.raises(SystemExit):
        pg.assert_production_config()


def test_production_ok_with_polza_keys(monkeypatch):
    _prod_env(monkeypatch)

    pg = _reload_prod_modules(monkeypatch)

    pg.assert_production_config()
