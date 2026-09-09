"""Load connector catalog metadata."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "catalog.json"

MVP_CONNECTOR_IDS = frozenset({"google_workspace", "github", "vercel", "discord"})


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    with open(_CATALOG_PATH, encoding="utf-8") as f:
        return json.load(f)


def list_catalog_entries() -> list[dict]:
    return list(load_catalog().get("connectors") or [])


def get_catalog_entry(connector_id: str) -> dict | None:
    cid = (connector_id or "").strip()
    for item in list_catalog_entries():
        if item.get("id") == cid:
            return dict(item)
    return None


def list_categories() -> list[dict]:
    return list(load_catalog().get("categories") or [])


def is_mvp_connector(connector_id: str) -> bool:
    entry = get_catalog_entry(connector_id)
    if not entry:
        return False
    return bool(entry.get("mvp")) and not entry.get("coming_soon")
