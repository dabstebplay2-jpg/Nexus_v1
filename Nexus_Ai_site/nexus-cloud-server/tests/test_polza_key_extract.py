"""Парсинг ответа MCP create_api_key."""

from app.services.polza import _extract_created_key_payload


def test_extract_raw_key_from_polza_mcp_response():
    raw = {
        "id": "key_2174197137493987329",
        "name": "nexus-1-user@example.com",
        "rawKey": "pza_test_key_abcdefghijklmnop",
        "status": "ACTIVE",
    }
    api_key, key_id = _extract_created_key_payload(raw)
    assert api_key == "pza_test_key_abcdefghijklmnop"
    assert key_id == "key_2174197137493987329"


def test_extract_legacy_key_field():
    raw = {"id": "k1", "key": "pza_legacy_key_xyz"}
    api_key, key_id = _extract_created_key_payload(raw)
    assert api_key == "pza_legacy_key_xyz"
    assert key_id == "k1"
