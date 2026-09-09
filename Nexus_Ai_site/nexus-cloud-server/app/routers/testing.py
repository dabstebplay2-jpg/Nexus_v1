"""API для режима тестирования (смена тарифа без оплаты)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import is_testing_mode
from app.database import UserDB, get_db
from app.security import get_current_user
from app.services.testing_mode import ensure_testing_subscription
from app.tiers import TIER_ORDER

router = APIRouter(prefix="/v1/testing", tags=["testing"])


class SetTierBody(BaseModel):
    tier: str = "ULTRA"


@router.get("/status")
async def testing_status():
    if not is_testing_mode():
        raise HTTPException(status_code=404, detail="Testing mode disabled")
    return {
        "testing_mode": True,
        "tiers": list(TIER_ORDER),
        "default_tier": "ULTRA",
    }


@router.post("/set-tier")
async def testing_set_tier(
    body: SetTierBody,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_testing_mode():
        raise HTTPException(status_code=404, detail="Testing mode disabled")
    tier = await ensure_testing_subscription(db, current_user, tier=body.tier)
    return {"status": "ok", "subscription_tier": tier, "email": current_user.email}
