from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import UserArtifactDB, UserDB, get_db
from app.schemas import ArtifactListResponse, ArtifactPayload, ArtifactSyncRequest
from app.security import get_current_user
from app.services.artifact_history import (
    list_user_artifacts,
    row_to_payload,
    trim_old_artifacts,
    upsert_artifact,
)
from app.services.auth_rate_limit import check_rate_limit

router = APIRouter(prefix="/v1/artifacts", tags=["artifacts"])


@router.get("", response_model=ArtifactListResponse)
async def list_artifacts(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = list_user_artifacts(db, current_user.id)
    return ArtifactListResponse(artifacts=[row_to_payload(r) for r in rows])


@router.put("/sync", response_model=ArtifactListResponse)
async def sync_artifacts(
    payload: ArtifactSyncRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"artifact_sync:user:{current_user.id}", 30, 60.0):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком частая синхронизация")
    for art in payload.artifacts[:200]:
        upsert_artifact(db, user_id=current_user.id, data=art.model_dump())
    trim_old_artifacts(db, current_user.id)
    db.commit()
    rows = list_user_artifacts(db, current_user.id)
    return ArtifactListResponse(artifacts=[row_to_payload(r) for r in rows])


@router.put("/{artifact_id}", response_model=ArtifactPayload)
async def upsert_one(
    artifact_id: str,
    payload: ArtifactPayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.id != artifact_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id в URL и теле не совпадают")
    row = upsert_artifact(db, user_id=current_user.id, data=payload.model_dump())
    trim_old_artifacts(db, current_user.id)
    db.commit()
    db.refresh(row)
    return row_to_payload(row)


@router.delete("/{artifact_id}")
async def delete_one(
    artifact_id: str,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(UserArtifactDB)
        .filter(UserArtifactDB.id == artifact_id, UserArtifactDB.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Артефакт не найден")
    db.delete(row)
    db.commit()
    return {"ok": True}
