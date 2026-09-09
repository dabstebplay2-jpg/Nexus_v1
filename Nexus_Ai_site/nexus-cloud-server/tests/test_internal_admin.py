def test_grant_tier_requires_grant_key(client):
    r = client.post(
        "/v1/internal/grant-tier",
        json={"email": "nobody@example.com", "tier": "ULTRA"},
        headers={"X-Grant-Key": "wrong"},
    )
    assert r.status_code in (403, 503)


def test_grant_by_master_removed(client):
    r = client.post(
        "/v1/internal/grant-tier-by-master",
        json={"email": "nobody@example.com", "tier": "ULTRA"},
        headers={"X-Router-Master-Key": "sk-test"},
    )
    assert r.status_code == 404


def test_grant_by_cloud_secret_removed(client):
    r = client.post(
        "/v1/internal/grant-tier-by-cloud-secret",
        json={"email": "nobody@example.com", "tier": "ULTRA"},
        headers={"X-Cloud-Secret": "any"},
    )
    assert r.status_code == 404
