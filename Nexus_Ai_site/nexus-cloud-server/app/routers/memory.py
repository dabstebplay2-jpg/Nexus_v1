import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models_catalog
from app.database import UserDB, get_db
from app.security import get_current_user
from app.services.ai_billing import apply_usage_billing
from app.services.auth_rate_limit import check_rate_limit
from app.services.polza import PolzaError, PolzaService, require_inference_api_key
from app.services.quota_limits import QuotaLimitExceeded, assert_quota_budget
from app.services.subscription_guard import enforce_paid_subscription
from app.services.user_memory import (
    MAX_MEMORY_CHARS,
    SYNTHESIZE_SYSTEM,
    collect_chat_excerpt,
    get_memory_payload,
    save_memory,
)
from app.tiers import tier_allows_ai, tier_requires_payment

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/user", tags=["user"])
_polza = PolzaService()


class UserMemoryPayload(BaseModel):
    content: str = Field(default="", max_length=MAX_MEMORY_CHARS)
    enabled: bool = True
    auto_learn: bool = True


class UserMemoryResponse(BaseModel):
    content: str
    enabled: bool
    auto_learn: bool = True
    updated_at: str | None = None


class MemorySynthesizeResponse(BaseModel):
    suggested_content: str


async def _check_ai_access(user: UserDB, db: Session) -> None:
    if tier_requires_payment(user.subscription_tier):
        await enforce_paid_subscription(db, user, trigger="memory")
    if not tier_allows_ai(user.subscription_tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ИИ доступен с тарифа Hobby и выше.",
        )


@router.get("/memory", response_model=UserMemoryResponse)
async def get_user_memory(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = get_memory_payload(db, current_user.id)
    return UserMemoryResponse(**data)


@router.put("/memory", response_model=UserMemoryResponse)
async def put_user_memory(
    payload: UserMemoryPayload,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"memory_save:user:{current_user.id}", 60, 60.0):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Слишком частые сохранения")
    data = save_memory(
        db,
        current_user.id,
        content=payload.content,
        enabled=payload.enabled,
        auto_learn=payload.auto_learn,
    )
    db.commit()
    return UserMemoryResponse(**data)


@router.post("/memory/synthesize", response_model=MemorySynthesizeResponse)
async def synthesize_user_memory(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not check_rate_limit(f"memory_synth:user:{current_user.id}", 5, 3600.0):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Синтез памяти можно запускать не чаще 5 раз в час.",
        )
    await _check_ai_access(current_user, db)
    try:
        assert_quota_budget(db, current_user)
    except QuotaLimitExceeded as e:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(e)) from e

    excerpt = collect_chat_excerpt(db, current_user.id)
    if not excerpt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нет сохранённых чатов в облаке для анализа. Пообщайтесь в чате и повторите.",
        )

    model = await models_catalog.get_default_model(current_user.subscription_tier, prefer="standard")
    try:
        api_key = require_inference_api_key(current_user)
    except PolzaError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYNTHESIZE_SYSTEM},
            {
                "role": "user",
                "content": f"Фрагменты переписки пользователя с ассистентом:\n\n{excerpt}",
            },
        ],
    }
    try:
        response = await _polza.chat_completions(api_key, body, timeout=120.0)
    except Exception as e:
        logger.exception("memory synthesize failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка модели: {e}",
        ) from e
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ошибка модели ({response.status_code})",
        )
    data = response.json()
    try:
        await apply_usage_billing(db, current_user, model=model, usage=data.get("usage"))
        db.commit()
    except Exception as exc:
        logger.exception("memory synthesize billing")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Не удалось списать использование памяти. Проверьте подписку и баланс.",
        ) from exc

    choice = data.get("choices", [{}])[0]
    reply = (choice.get("message", {}) or {}).get("content", "") or ""
    suggested = reply.strip()[:MAX_MEMORY_CHARS]
    if not suggested:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Модель вернула пустой ответ. Попробуйте позже.",
        )
    return MemorySynthesizeResponse(suggested_content=suggested)
