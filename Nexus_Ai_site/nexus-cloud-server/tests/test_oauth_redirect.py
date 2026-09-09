from app.services import oauth_redirect as mod


def test_rejects_unknown_origin(monkeypatch):
    monkeypatch.setattr(mod, "oauth_allowed_redirect_bases", lambda: ["https://app.example.com"])
    monkeypatch.setattr(mod, "NEXUS_FRONTEND_URL", "https://app.example.com")
    assert mod.normalize_return_to("https://evil.com") is None
    assert mod.safe_oauth_redirect_base("https://evil.com") == "https://app.example.com"


def test_allows_frontend_origin(monkeypatch):
    monkeypatch.setattr(mod, "oauth_allowed_redirect_bases", lambda: ["https://app.example.com"])
    assert mod.normalize_return_to("https://app.example.com/dashboard") == "https://app.example.com"
