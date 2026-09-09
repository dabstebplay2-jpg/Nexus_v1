"""Connectors list API enrichment."""

from app.connectors.catalog import get_catalog_entry
from app.database import UserDB
from app.routers.connectors import _enrich_connector_entry, _oauth_status_summary


def test_enrich_mvp_github_free_user_blocked():
    entry = get_catalog_entry("github")
    assert entry is not None
    user = UserDB(id=1, email="t@t.com", subscription_tier="FREE")
    merged = _enrich_connector_entry(entry, user, {})
    assert merged["blocked_reason"] == "tier"
    assert merged["available"] is False
    assert merged["required_tier"] == "HOBBY"


def test_enrich_discord_hobby_available():
    entry = get_catalog_entry("discord")
    user = UserDB(id=1, email="t@t.com", subscription_tier="HOBBY")
    merged = _enrich_connector_entry(entry, user, {})
    assert merged["blocked_reason"] is None
    assert merged["available"] is True
    assert merged["oauth_ready"] is True


def test_oauth_status_summary_shape():
    summary = _oauth_status_summary()
    assert "mvp_oauth_ready" in summary
    assert "providers" in summary
    assert "github" in summary["providers"]
