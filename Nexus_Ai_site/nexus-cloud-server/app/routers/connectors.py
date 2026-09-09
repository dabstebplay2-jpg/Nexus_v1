"""Connectors catalog and user connections."""

from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.connectors.catalog import (
    MVP_CONNECTOR_IDS,
    get_catalog_entry,
    is_mvp_connector,
    list_catalog_entries,
    list_categories,
)
from app.database import UserDB, get_db
from app.security import get_current_user
from app.services.connectors.oauth_providers import (
    connector_oauth_ready,
    create_connect_url,
    handle_oauth_callback,
)
from app.services.connectors.oauth_state import pop_connector_oauth_state
from app.services.connectors.store import (
    disconnect,
    list_user_connections,
    set_enabled_for_chat,
    upsert_connection,
)
from app.services.models_registry import tier_rank
from app.services.oauth_redirect import safe_oauth_redirect_base
from app.tiers import normalize_tier

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/connectors", tags=["connectors"])


class ConnectorConnectBody(BaseModel):
    return_to: str | None = None


class DiscordWebhookBody(BaseModel):
    webhook_url: str = Field(max_length=512)
    channel_label: str | None = Field(None, max_length=128)


class ConnectorPatchBody(BaseModel):
    enabled_for_chat: bool


def _tier_allows_connector(user: UserDB, entry: dict) -> bool:
    required = normalize_tier(entry.get("required_tier") or "HOBBY")
    return tier_rank(user.subscription_tier) >= tier_rank(required)


def _blocked_reason(entry: dict, *, tier_ok: bool, oauth_ready: bool) -> str | None:
    if entry.get("coming_soon"):
        return "coming_soon"
    cid = entry.get("id") or ""
    if not is_mvp_connector(cid):
        return "coming_soon"
    if not tier_ok:
        return "tier"
    auth_type = entry.get("auth_type") or "oauth"
    if auth_type == "oauth" and not oauth_ready:
        return "oauth_not_configured"
    return None


def _enrich_connector_entry(entry: dict, user: UserDB, conn_map: dict[str, dict]) -> dict:
    cid = entry["id"]
    required_tier = normalize_tier(entry.get("required_tier") or "HOBBY")
    tier_ok = _tier_allows_connector(user, entry)
    oauth_ready = connector_oauth_ready(cid)
    merged = {
        **entry,
        "required_tier": required_tier,
        "oauth_ready": oauth_ready,
        "connected": cid in conn_map,
        "enabled_for_chat": False,
    }
    if cid in conn_map:
        merged.update(conn_map[cid])
    blocked = _blocked_reason(entry, tier_ok=tier_ok, oauth_ready=oauth_ready)
    merged["blocked_reason"] = blocked
    merged["available"] = blocked is None
    return merged


def _oauth_status_summary() -> dict:
    """Which MVP OAuth providers are configured on the server."""
    mvp_oauth = [c for c in MVP_CONNECTOR_IDS if c != "discord"]
    ready = {cid: connector_oauth_ready(cid) for cid in mvp_oauth}
    return {
        "mvp_oauth_ready": all(ready.values()),
        "providers": ready,
    }


def _connection_map(db: Session, user_id: int) -> dict[str, dict]:
    out = {}
    for row in list_user_connections(db, user_id):
        out[row.connector_id] = {
            "status": row.status,
            "account_label": row.account_label,
            "enabled_for_chat": bool(row.enabled_for_chat),
            "connected": True,
        }
    return out


@router.get("")
def list_connectors(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn_map = _connection_map(db, current_user.id)
    items = [_enrich_connector_entry(entry, current_user, conn_map) for entry in list_catalog_entries()]
    user_tier = normalize_tier(current_user.subscription_tier)
    mvp_items = [c for c in items if c["id"] in MVP_CONNECTOR_IDS]
    tier_blocks_mvp = user_tier == "FREE" and any(c.get("blocked_reason") == "tier" for c in mvp_items)
    return {
        "categories": list_categories(),
        "connectors": items,
        "user_tier": user_tier,
        "tier_blocks_connectors": tier_blocks_mvp,
        "oauth_status": _oauth_status_summary(),
    }


@router.post("/{connector_id}/connect")
def start_connect(
    connector_id: str,
    body: ConnectorConnectBody | None = None,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_catalog_entry(connector_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Коннектор не найден")
    if entry.get("coming_soon"):
        raise HTTPException(status_code=400, detail="Коннектор пока недоступен")
    if not _tier_allows_connector(current_user, entry):
        raise HTTPException(status_code=403, detail="Недостаточный тариф для этого коннектора")

    if connector_id == "discord":
        return {
            "auth_type": "webhook",
            "message": "Укажите URL вебхука Discord (POST /v1/connectors/discord/webhook)",
        }

    return_to = body.return_to if body else None
    try:
        url = create_connect_url(
            db,
            user_id=current_user.id,
            connector_id=connector_id,
            return_to=return_to,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"auth_type": "oauth", "url": url}


@router.get("/{connector_id}/callback")
async def oauth_callback(
    connector_id: str,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    base = safe_oauth_redirect_base(None)
    target_base = f"{base}/connectors/callback"
    if error:
        return RedirectResponse(f"{target_base}?error={quote(error)}&connector={quote(connector_id)}")
    if not code or not state:
        return RedirectResponse(f"{target_base}?error=missing_code&connector={quote(connector_id)}")
    try:
        user_id, cid, verifier, return_to = pop_connector_oauth_state(db, state)
    except ValueError:
        return RedirectResponse(f"{target_base}?error=oauth_state&connector={quote(connector_id)}")
    if cid != connector_id:
        return RedirectResponse(f"{target_base}?error=connector_mismatch&connector={quote(connector_id)}")
    try:
        label = await handle_oauth_callback(
            db,
            connector_id=connector_id,
            code=code,
            verifier=verifier,
            user_id=user_id,
        )
    except Exception as exc:
        logger.exception("connector callback failed: %s", exc)
        return RedirectResponse(f"{target_base}?error=oauth_failed&connector={quote(connector_id)}")
    front = safe_oauth_redirect_base(return_to)
    return RedirectResponse(
        f"{front}/connectors/callback?status=ok&connector={quote(connector_id)}&label={quote(label)}"
    )


@router.post("/discord/webhook")
def connect_discord_webhook(
    body: DiscordWebhookBody,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    url = body.webhook_url.strip()
    if not url.startswith("https://discord.com/api/webhooks/"):
        raise HTTPException(status_code=400, detail="Некорректный URL вебхука Discord")
    row = upsert_connection(
        db,
        user_id=current_user.id,
        connector_id="discord",
        credentials={"webhook_url": url},
        account_label=body.channel_label or "Discord webhook",
    )
    return {
        "connector_id": "discord",
        "account_label": row.account_label,
        "connected": True,
    }


@router.delete("/{connector_id}")
def remove_connection(
    connector_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not disconnect(db, current_user.id, connector_id):
        raise HTTPException(status_code=404, detail="Подключение не найдено")
    return {"ok": True}


@router.patch("/{connector_id}")
def patch_connection(
    connector_id: str,
    body: ConnectorPatchBody,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = set_enabled_for_chat(db, current_user.id, connector_id, body.enabled_for_chat)
    if not row:
        raise HTTPException(status_code=404, detail="Подключение не найдено")
    return {
        "connector_id": connector_id,
        "enabled_for_chat": bool(row.enabled_for_chat),
    }


@router.get("/status/summary")
def connectors_summary(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """For chat UI chips."""
    rows = list_user_connections(db, current_user.id)
    return {
        "connected": [
            {
                "id": r.connector_id,
                "label": r.account_label or r.connector_id,
                "enabled_for_chat": bool(r.enabled_for_chat),
            }
            for r in rows
        ]
    }
