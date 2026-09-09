import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import ChatConversationDB, UserDB, get_db
from app.schemas import (
    ChatConversationPayload,
    ChatImportRequest,
    ChatListResponse,
    ChatSyncRequest,
)
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.chat_history import (
    list_user_chats,
    row_to_payload,
    trim_old_conversations,
    upsert_conversation,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/chats", tags=["chats"])


def _conv_to_payload(conv: ChatConversationPayload) -> dict:
    return conv.model_dump()


@router.get("", response_model=ChatListResponse)
async def list_chats(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = list_user_chats(db, current_user.id, workspace_id=None)
    return ChatListResponse(conversations=[row_to_payload(r) for r in rows])


@router.put("/sync", response_model=ChatListResponse)
async def sync_chats(
    payload: ChatSyncRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"chat_sync:user:{current_user.id}", 30, 60.0):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком частая синхронизация")
    for conv in payload.conversations[:80]:
        if conv.workspaceId:
            continue
        upsert_conversation(
            db,
            user_id=current_user.id,
            conv=_conv_to_payload(conv),
            workspace_id=None,
        )
    trim_old_conversations(db, current_user.id, workspace_id=None)
    db.commit()
    rows = list_user_chats(db, current_user.id, workspace_id=None)
    return ChatListResponse(conversations=[row_to_payload(r) for r in rows])


@router.post("/import", response_model=ChatListResponse)
async def import_chats(
    payload: ChatImportRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = list_user_chats(db, current_user.id, workspace_id=None)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="На сервере уже есть чаты. Импорт доступен только для пустого аккаунта.",
        )
    for conv in payload.conversations[:80]:
        if conv.workspaceId:
            continue
        upsert_conversation(
            db,
            user_id=current_user.id,
            conv=_conv_to_payload(conv),
            workspace_id=None,
        )
    db.commit()
    rows = list_user_chats(db, current_user.id, workspace_id=None)
    return ChatListResponse(conversations=[row_to_payload(r) for r in rows])


@router.get("/{chat_id}", response_model=ChatConversationPayload)
async def get_chat(
    chat_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ChatConversationDB)
        .filter(
            ChatConversationDB.id == chat_id,
            ChatConversationDB.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    return row_to_payload(row)


@router.put("/{chat_id}", response_model=ChatConversationPayload)
async def upsert_chat(
    chat_id: str,
    payload: ChatConversationPayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"chat_save:user:{current_user.id}", 120, 60.0):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком частые сохранения")
    if payload.id != chat_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id в URL и теле не совпадают")
    row = upsert_conversation(
        db,
        user_id=current_user.id,
        conv=_conv_to_payload(payload),
        workspace_id=None,
    )
    trim_old_conversations(db, current_user.id, workspace_id=None)
    db.commit()
    db.refresh(row)
    return row_to_payload(row)


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ChatConversationDB)
        .filter(
            ChatConversationDB.id == chat_id,
            ChatConversationDB.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    db.delete(row)
    db.commit()
    return {"ok": True}
