import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import UserDB, get_db
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.browser_sync_store import get_browser_sync, save_browser_sync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/user", tags=["user"])


class TabSessionTab(BaseModel):
    url: str
    title: str | None = None
    pinned: bool = False


class TabSession(BaseModel):
    tabs: list[TabSessionTab] = Field(default_factory=list)
    activeIndex: int = 0
    deviceLabel: str | None = None
    updatedAt: int | None = None


class BrowserSyncPayload(BaseModel):
    version: int = 1
    settings: dict[str, Any] = Field(default_factory=dict)
    ntpShortcuts: list[dict[str, Any]] = Field(default_factory=list)
    bookmarks: list[dict[str, Any]] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list)
    chatSessions: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    tabSession: TabSession | None = None
    updatedAt: int | None = None


class BrowserSyncPutRequest(BaseModel):
    payload: BrowserSyncPayload
    client_updated_at: int | None = None
    client_version: str | None = None


class BrowserSyncResponse(BaseModel):
    payload: BrowserSyncPayload | None = None
    updated_at: str | None = None
    client_version: str | None = None


@router.get("/browser-sync", response_model=BrowserSyncResponse)
async def get_user_browser_sync(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = get_browser_sync(db, current_user.id)
    payload = data.get("payload")
    return BrowserSyncResponse(
        payload=BrowserSyncPayload(**payload) if payload else None,
        updated_at=data.get("updated_at"),
        client_version=data.get("client_version"),
    )


@router.put("/browser-sync", response_model=BrowserSyncResponse)
async def put_user_browser_sync(
    body: BrowserSyncPutRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"browser_sync:user:{current_user.id}", 30, 60.0):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком частые сохранения")

    try:
        data = save_browser_sync(
            db,
            current_user.id,
            payload=body.payload.model_dump(),
            client_version=body.client_version,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e)) from e

    payload = data.get("payload")
    return BrowserSyncResponse(
        payload=BrowserSyncPayload(**payload) if payload else None,
        updated_at=data.get("updated_at"),
        client_version=data.get("client_version"),
    )
