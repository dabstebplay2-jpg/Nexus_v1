"""OAuth PKCE Polza.ai — подключение личного ключа пользователя."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import NEXUS_FRONTEND_URL
from app.database import UserDB, get_db
from app.security import get_current_user
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.invoice_pool import get_user_period_pool_usd
from app.services.polza import (
    PolzaError,
    create_pkce_session,
    exchange_code_for_key,
    fetch_user_balance_rub,
    resolve_oauth_callback_url,
    set_user_polza_key,
    sync_polza_key_limit_after_payment,
    user_has_polza_key,
)
from app.services.quota_limits import get_quota_limit_info

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/auth/polza", tags=["polza-auth"])


def _request_api_base(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}"


@router.get("/connect")
async def polza_connect(
    request: Request,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Начать OAuth PKCE — вернуть URL для редиректа в Polza.ai."""
    _, _, authorize_url = create_pkce_session(db, current_user.id)
    return {"redirect_url": authorize_url}


@router.get("/callback")
async def polza_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Callback после consent screen Polza.ai."""
    frontend = (NEXUS_FRONTEND_URL or "https://nexus-zeta-ruby-12.vercel.app").rstrip("/")
    if error:
        return RedirectResponse(f"{frontend}/?polza=denied&settings=usage")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Отсутствует code или state")
    callback_url = resolve_oauth_callback_url(_request_api_base(request))
    try:
        api_key, polza_user_id, user_id = await exchange_code_for_key(
            db, code=code, state=state, callback_url=callback_url
        )
    except PolzaError as exc:
        logger.warning("polza callback: %s", exc)
        return RedirectResponse(f"{frontend}/?polza=error&settings=usage")
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        return RedirectResponse(f"{frontend}/?polza=error&settings=usage")
    set_user_polza_key(db, user, api_key, polza_user_id)
    rate = get_usd_rub_rate_sync()
    pool_usd = get_user_period_pool_usd(db, user) or 0.0
    pool_rub = usd_to_rub(pool_usd, rate) if pool_usd else 0.0
    if pool_rub > 0:
        await sync_polza_key_limit_after_payment(user, pool_rub=pool_rub)
        db.commit()
    return RedirectResponse(f"{frontend}/?polza=connected&settings=usage")


@router.get("/status")
async def polza_status(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    has_key = user_has_polza_key(current_user)
    balance_rub = await fetch_user_balance_rub(current_user) if has_key else None
    quota = get_quota_limit_info(db, current_user)
    rate = get_usd_rub_rate_sync()
    pool_rub = usd_to_rub(float(quota.get("subscription_cap_usd") or quota.get("cap_usd") or 0), rate)
    return {
        "has_polza_key": has_key,
        "polza_user_id": getattr(current_user, "polza_user_id", None),
        "polza_balance_rub": balance_rub,
        "polza_connect_required": bool(getattr(current_user, "polza_connect_required", 0)),
        "subscription_pool_rub": pool_rub,
    }
