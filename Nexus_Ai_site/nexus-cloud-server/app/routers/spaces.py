from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import ChatConversationDB, UserDB, WorkspaceDB, get_db
from app.schemas import SpaceStatePayload, SpaceStateResponse
from app.security import get_current_user
from app.services.auth_rate_limit import check_rate_limit
from app.services.chat_history import row_to_payload, trim_old_conversations, upsert_conversation
from app.time_utils import utc_now

router = APIRouter(prefix="/v1/spaces", tags=["spaces"])

MAX_WORKSPACES = 40
MAX_CONVERSATIONS = 240


def _ms_to_dt(value: int | float | None) -> datetime:
    if value is None:
        return utc_now()
    try:
        number = float(value)
        seconds = number / 1000.0 if number > 1e12 else number
        return datetime.fromtimestamp(seconds, timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return utc_now()


def _dt_to_ms(value: datetime | None) -> int:
    return int((value or utc_now()).timestamp() * 1000)


def _workspace_payload(row: WorkspaceDB) -> dict:
    return {
        "id": row.workspace_id,
        "name": row.name,
        "emoji": row.emoji,
        "createdAt": _dt_to_ms(row.created_at),
        "updatedAt": _dt_to_ms(row.updated_at),
    }


def _state_response(db: Session, user_id: int) -> SpaceStateResponse:
    workspaces = (
        db.query(WorkspaceDB)
        .filter(WorkspaceDB.user_id == user_id)
        .order_by(WorkspaceDB.updated_at.desc())
        .limit(MAX_WORKSPACES)
        .all()
    )
    conversations = (
        db.query(ChatConversationDB)
        .filter(
            ChatConversationDB.user_id == user_id,
            ChatConversationDB.workspace_id.isnot(None),
        )
        .order_by(ChatConversationDB.updated_at.desc())
        .limit(MAX_CONVERSATIONS)
        .all()
    )
    return SpaceStateResponse(
        workspaces=[_workspace_payload(row) for row in workspaces],
        conversations=[row_to_payload(row) for row in conversations],
    )


@router.get("", response_model=SpaceStateResponse)
async def list_spaces(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _state_response(db, current_user.id)


@router.put("/sync", response_model=SpaceStateResponse)
async def sync_spaces(
    payload: SpaceStatePayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"space_sync:user:{current_user.id}", 40, 60.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком частая синхронизация пространств",
        )

    incoming_workspaces = payload.workspaces[:MAX_WORKSPACES]
    workspace_ids = {workspace.id for workspace in incoming_workspaces}
    if len(workspace_ids) != len(incoming_workspaces):
        raise HTTPException(status_code=400, detail="Идентификаторы пространств должны быть уникальны")

    existing_workspaces = (
        db.query(WorkspaceDB).filter(WorkspaceDB.user_id == current_user.id).all()
    )
    existing_by_id = {row.workspace_id: row for row in existing_workspaces}

    for workspace in incoming_workspaces:
        row = existing_by_id.get(workspace.id)
        if row is None:
            row = WorkspaceDB(
                user_id=current_user.id,
                workspace_id=workspace.id,
                created_at=_ms_to_dt(workspace.createdAt),
            )
            db.add(row)
        row.name = workspace.name.strip()[:120] or "Моё пространство"
        row.emoji = workspace.emoji.strip()[:16] or "✨"
        row.updated_at = _ms_to_dt(workspace.updatedAt)

    for row in existing_workspaces:
        if row.workspace_id not in workspace_ids:
            db.delete(row)

    incoming_conversation_ids: set[str] = set()
    for conversation in payload.conversations[:MAX_CONVERSATIONS]:
        workspace_id = conversation.workspaceId
        if not workspace_id or workspace_id not in workspace_ids:
            continue
        incoming_conversation_ids.add(conversation.id)
        upsert_conversation(
            db,
            user_id=current_user.id,
            conv=conversation.model_dump(),
            workspace_id=workspace_id,
        )

    existing_conversations = (
        db.query(ChatConversationDB)
        .filter(
            ChatConversationDB.user_id == current_user.id,
            ChatConversationDB.workspace_id.isnot(None),
        )
        .all()
    )
    for row in existing_conversations:
        if row.id not in incoming_conversation_ids or row.workspace_id not in workspace_ids:
            db.delete(row)

    for workspace_id in workspace_ids:
        trim_old_conversations(db, current_user.id, workspace_id=workspace_id)

    db.commit()
    return _state_response(db, current_user.id)
