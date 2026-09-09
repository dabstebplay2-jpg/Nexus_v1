def test_testing_status_hidden_when_disabled(client):
    r = client.get("/v1/testing/status")
    assert r.status_code == 404
