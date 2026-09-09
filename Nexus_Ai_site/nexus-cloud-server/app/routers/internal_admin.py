"""Внутренние операции (выдача тарифа) — только NEXUS_ADMIN_GRANT_KEY."""

from __future__ import annotations

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import UserDB, get_db
from app.services.polza_balance_cron import run_polza_balance_check
from app.services.subscription_activate import activate_paid_tier
from app.tiers import normalize_tier

router = APIRouter(prefix="/v1/internal", tags=["internal"])

GRANT_KEY = (os.environ.get("NEXUS_ADMIN_GRANT_KEY") or "").strip()
CRON_SECRET = (os.environ.get("NEXUS_CRON_SECRET") or "").strip()


class GrantTierBody(BaseModel):
    email: EmailStr
    tier: str = "ULTRA"


def _require_cron_secret(x_cron_secret: str = Header(..., alias="X-Cron-Secret")) -> None:
    if not CRON_SECRET or len(CRON_SECRET) < 16:
        raise HTTPException(status_code=503, detail="NEXUS_CRON_SECRET not configured on server")
    if not secrets.compare_digest(x_cron_secret, CRON_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")


def _require_grant_key(x_grant_key: str = Header(..., alias="X-Grant-Key")) -> None:
    if not GRANT_KEY or len(GRANT_KEY) < 32:
        raise HTTPException(status_code=503, detail="NEXUS_ADMIN_GRANT_KEY not configured on server")
    if not secrets.compare_digest(x_grant_key, GRANT_KEY):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/grant-tier")
async def grant_tier(
    body: GrantTierBody,
    _: None = Depends(_require_grant_key),
    db: Session = Depends(get_db),
):
    tier = normalize_tier(body.tier)
    user = db.query(UserDB).filter(UserDB.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    result = await activate_paid_tier(db, user, tier, grant_source="admin")
    return {
        "status": "ok",
        "email": user.email,
        "subscription_tier": user.subscription_tier,
        **result,
    }


@router.post("/cron/routerai-funding")
@router.post("/cron/polza-balance")
async def cron_polza_balance(
    _: None = Depends(_require_cron_secret),
    db: Session = Depends(get_db),
):
    """Cron: проверка баланса org Polza и ops-алерт в Discord."""
    return await run_polza_balance_check(db)
