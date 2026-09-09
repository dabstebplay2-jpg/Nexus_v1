def test_health_minimal(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "testing_mode" not in data


def test_health_verbose(client):
    r = client.get("/v1/health?verbose=true")
    assert r.status_code == 200
    assert "database" in r.json()
