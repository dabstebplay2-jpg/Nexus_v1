import logging
import math
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import (
    AUTH_OTP_REQUEST_EMAIL_WINDOW_SEC,
    AUTH_OTP_REQUEST_PER_EMAIL,
    NEXUS_FRONTEND_URL,
    TELEGRAM_BOT_USERNAME,
    email_auth_enabled,
    google_oauth_configured,
    is_testing_mode,
    telegram_bot_enabled,
    telegram_login_domain,
)
from app.database import UserDB, get_db, hash_password, verify_password
from app.schemas import (
    AuthConfigResponse,
    EmailRequestCode,
    EmailVerifyCode,
    GoogleExchangeRequest,
    MessageResponse,
    ProfileResponse,
    RefreshRequest,
    TelegramExchangePreviewResponse,
    TelegramExchangeRequest,
    TelegramLoginRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
)
from app.security import create_access_token, get_current_user
from app.services.auth_bruteforce import (
    assert_login_allowed,
    record_failed_login,
    reset_login_attempts,
)
from app.services.auth_rate_limit import RateLimitExceeded
from app.services.auth_session import issue_tokens_and_setup
from app.services.email_login import request_login_code, verify_login_code
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.google_oauth import create_oauth_start, exchange_auth_code, handle_google_callback
from app.services.oauth_redirect import safe_oauth_redirect_base
from app.services.polza import user_has_polza_key
from app.services.quota_limits import get_quota_limit_info
from app.services.subscription_guard import (
    enforce_paid_subscription,
    user_has_active_paid_subscription,
)
from app.services.telegram_auth import (
    bind_email_for_telegram_user,
    exchange_telegram_auth_code,
    is_telegram_synthetic_email,
    login_via_telegram_widget,
    preview_telegram_exchange,
    request_bind_email_code,
)
from app.services.testing_mode import ensure_testing_subscription
from app.tiers import (  # noqa: F401
    normalize_tier,
    tier_allows_ai,
    tier_monthly_cap,
    tier_requires_payment,
)
from app.time_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _sanitize_balance_usd(value: float) -> float:
    n = float(value or 0)
    if not math.isfinite(n) or abs(n) > 1_000_000:
        return 0.0
    return round(n, 6)


def _profile_payload(user: UserDB, db: Session) -> dict:
    tier = normalize_tier(user.subscription_tier)
    quota = get_quota_limit_info(db, user)
    rate = get_usd_rub_rate_sync()
    balance_usd = _sanitize_balance_usd(user.balance)
    if balance_usd != float(user.balance or 0):
        user.balance = balance_usd
        db.commit()
    sub_cap_usd = float(quota.get("subscription_cap_usd") or quota["cap_usd"])
    sub_remaining_usd = float(quota.get("subscription_remaining_usd") or 0)
    cap_rub = usd_to_rub(quota["cap_usd"], rate)
    spent_rub = usd_to_rub(quota["spent_usd"], rate)
    remaining_rub = usd_to_rub(quota["remaining_usd"], rate)
    sub_cap_rub = usd_to_rub(sub_cap_usd, rate)
    sub_remaining_rub = usd_to_rub(sub_remaining_usd, rate)
    paid_entitled = tier_requires_payment(tier) and user_has_active_paid_subscription(db, user)
    email_verified = bool(getattr(user, "email_verified_at", None))
    return {
        "email": user.email,
        "email_verified": email_verified,
        "has_google": bool(getattr(user, "google_sub", None)),
        "telegram_linked": bool(getattr(user, "telegram_id", None)),
        "telegram_username": getattr(user, "telegram_username", None),
        "needs_real_email": is_telegram_synthetic_email(user.email),
        "subscription_tier": tier,
        "subscription_active": paid_entitled if tier_requires_payment(tier) else True,
        "balance": balance_usd,
        "balance_usd": balance_usd,
        "balance_rub": usd_to_rub(balance_usd, rate),
        "currency": "RUB",
        "billing_mode": "monthly_quota",
        "usd_rub_rate": rate,
        "monthly_quota_usd": sub_cap_usd,
        "monthly_quota_rub": sub_cap_rub,
        "monthly_cap_usd": sub_cap_usd,
        "monthly_cap_rub": sub_cap_rub,
        "monthly_spent_usd": quota["spent_usd"],
        "monthly_spent_rub": spent_rub,
        "monthly_remaining_usd": sub_remaining_usd,
        "monthly_remaining_rub": sub_remaining_rub,
        "monthly_used_percent": quota["used_percent"],
        "total_remaining_usd": quota["remaining_usd"],
        "total_remaining_rub": remaining_rub,
        "topup_balance_usd": balance_usd,
        "topup_balance_rub": usd_to_rub(balance_usd, rate),
        "period_end": quota.get("period_end"),
        "period_expired": bool(quota.get("period_expired")),
        "has_polza_key": user_has_polza_key(user),
        "polza_connect_required": bool(getattr(user, "polza_connect_required", 0)),
        "ai_enabled": tier_allows_ai(tier)
        and (not tier_requires_payment(tier) or paid_entitled)
        and quota.get("quota_enabled", False),
        "daily_quota_usd": quota["cap_usd"],
        "daily_quota_rub": cap_rub,
        "daily_cap_usd": quota["cap_usd"],
        "daily_spent_usd": quota["spent_usd"],
        "daily_remaining_usd": quota["remaining_usd"],
        "daily_used_percent": quota["used_percent"],
        "daily_cap_rub": cap_rub,
        "daily_spent_rub": spent_rub,
        "daily_remaining_rub": remaining_rub,
    }


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


@router.post("/register", response_model=TokenResponse)
async def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    assert_login_allowed(email, _client_ip(request), action="register")
    existing_user = db.query(UserDB).filter(UserDB.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже зарегистрирован")

    if payload.tier and normalize_tier(payload.tier) != "FREE":
        raise HTTPException(
            status_code=400,
            detail="Платный тариф доступен только после оплаты. Зарегистрируйтесь и оформите подписку.",
        )

    tier = "FREE"
    hashed = hash_password(payload.password)
    refresh_token = "ref_" + str(uuid.uuid4())

    new_user = UserDB(
        email=email,
        hashed_password=hashed,
        subscription_tier=tier,
        balance=0.0,
        refresh_token=refresh_token,
        email_verified_at=utc_now(),
        auth_methods="password",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if is_testing_mode():
        await ensure_testing_subscription(db, new_user, tier="ULTRA")

    reset_login_attempts(email, _client_ip(request))
    return await issue_tokens_and_setup(db, new_user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    assert_login_allowed(email, _client_ip(request), action="login")
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if not user or not user.hashed_password:
        record_failed_login(email, _client_ip(request))
        raise HTTPException(status_code=400, detail="Неверный email или пароль")
    if not verify_password(payload.password, user.hashed_password):
        record_failed_login(email, _client_ip(request))
        raise HTTPException(status_code=400, detail="Неверный email или пароль")

    reset_login_attempts(email, _client_ip(request))
    return await issue_tokens_and_setup(db, user)


@router.get("/config", response_model=AuthConfigResponse)
def auth_config():
    from app.config import (
        GOOGLE_REDIRECT_URI,
        oauth_allowed_redirect_bases,
        redis_persistence_enabled,
    )

    email_on = email_auth_enabled()
    return AuthConfigResponse(
        google_oauth_enabled=google_oauth_configured(),
        email_auth_enabled=email_on,
        telegram_auth_enabled=telegram_bot_enabled() and email_on,
        telegram_bot_username=(TELEGRAM_BOT_USERNAME or None)
        if telegram_bot_enabled() and email_on
        else None,
        telegram_login_domain=telegram_login_domain() if telegram_bot_enabled() else None,
        otp_resend_cooldown_sec=60,
        otp_email_window_sec=AUTH_OTP_REQUEST_EMAIL_WINDOW_SEC,
        otp_email_max_requests=AUTH_OTP_REQUEST_PER_EMAIL,
        oauth_redis_enabled=redis_persistence_enabled(),
        oauth_allowed_origins=oauth_allowed_redirect_bases(),
        google_redirect_uri_configured=GOOGLE_REDIRECT_URI or None,
    )


@router.post("/email/request-code", response_model=MessageResponse)
async def email_request_code(
    payload: EmailRequestCode,
    request: Request,
    db: Session = Depends(get_db),
):
    if not email_auth_enabled():
        raise HTTPException(
            status_code=403,
            detail="Вход по email отключён. Используйте «Продолжить с Google».",
        )
    try:
        return await request_login_code(db, str(payload.email), _client_ip(request))
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "message": e.message,
                "retry_after_seconds": e.retry_after_seconds,
            },
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/email/verify-code", response_model=TokenResponse)
async def email_verify_code(payload: EmailVerifyCode, db: Session = Depends(get_db)):
    if not email_auth_enabled():
        raise HTTPException(
            status_code=403,
            detail="Вход по email отключён. Используйте «Продолжить с Google».",
        )
    try:
        return await verify_login_code(db, str(payload.email), payload.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/google/start")
def google_start(
    return_to: str = "",
    login_hint: str = "",
    db: Session = Depends(get_db),
):
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="Вход через Google временно недоступен")
    try:
        hint = login_hint.strip().lower() if login_hint else None
        url = create_oauth_start(db, return_to, login_hint=hint)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return RedirectResponse(url)


def _oauth_error_code(exc: BaseException) -> str:
    msg = str(exc).lower()
    if "redirect_uri_mismatch" in msg:
        return "oauth_redirect"
    if "invalid_client" in msg:
        return "oauth_client"
    if "сессия oauth" in msg or "истекла" in msg:
        return "oauth_state"
    if "invalid_client" in msg and "google_client_id" in msg:
        return "oauth_client"
    if "токен google" in msg or "id_token" in msg or "tokeninfo" in msg:
        return "oauth_jwt"
    if "обмена кода" in msg or "войти через google" in msg:
        return "oauth_token"
    if "привязан" in msg:
        return "oauth_account"
    if "пользователь не найден" in msg:
        return "oauth_exchange"
    return "oauth_failed"


@router.get("/google/callback")
async def google_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    if error:
        base = safe_oauth_redirect_base(None)
        target = f"{base}/auth/callback?error={quote(error, safe='')}"
        return RedirectResponse(target)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Некорректный ответ Google")
    try:
        return_to, exchange = await handle_google_callback(db, code, state)
    except ValueError as e:
        reason = _oauth_error_code(e)
        logger.info("google_callback rejected (%s): %s", reason, e)
        target = f"{NEXUS_FRONTEND_URL}/auth/callback?error={quote(reason, safe='')}"
        return RedirectResponse(target)
    except Exception as exc:
        logger.exception("google_callback failed: %s", exc)
        target = f"{NEXUS_FRONTEND_URL}/auth/callback?error=oauth_failed"
        return RedirectResponse(target)

    base = safe_oauth_redirect_base(return_to)
    target = f"{base}/auth/callback?exchange={quote(exchange, safe='')}"
    return RedirectResponse(target)


@router.post("/google/exchange", response_model=TokenResponse)
async def google_exchange(payload: GoogleExchangeRequest, db: Session = Depends(get_db)):
    try:
        return await exchange_auth_code(db, payload.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/telegram/login", response_model=TokenResponse)
async def telegram_login(payload: TelegramLoginRequest, db: Session = Depends(get_db)):
    try:
        return await login_via_telegram_widget(db, payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/telegram/exchange/preview", response_model=TelegramExchangePreviewResponse)
async def telegram_exchange_preview(payload: TelegramExchangeRequest, db: Session = Depends(get_db)):
    try:
        return preview_telegram_exchange(db, payload.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/telegram/exchange", response_model=TokenResponse)
async def telegram_exchange(payload: TelegramExchangeRequest, db: Session = Depends(get_db)):
    try:
        return await exchange_telegram_auth_code(db, payload.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/email/bind-request", response_model=MessageResponse)
async def email_bind_request(
    payload: EmailRequestCode,
    request: Request,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_telegram_synthetic_email(current_user.email):
        raise HTTPException(status_code=400, detail="Email уже указан.")
    try:
        return await request_bind_email_code(db, current_user, str(payload.email), _client_ip(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=e.message) from e


@router.post("/email/bind-verify", response_model=TokenResponse)
async def email_bind_verify(
    payload: EmailVerifyCode,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_telegram_synthetic_email(current_user.email):
        raise HTTPException(status_code=400, detail="Email уже указан.")
    try:
        user = await bind_email_for_telegram_user(db, current_user, str(payload.email), payload.code)
        return await issue_tokens_and_setup(db, user, mark_email_verified=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/logout", response_model=MessageResponse)
def logout_session(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.refresh_token = None
    db.commit()
    return {"message": "ok"}


@router.post("/refresh", response_model=TokenResponse)
def refresh_session(payload: RefreshRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.refresh_token == payload.refresh_token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    new_refresh = "ref_" + str(uuid.uuid4())
    user.refresh_token = new_refresh
    db.commit()

    new_access = create_access_token({"sub": user.email})
    return {"access_token": new_access, "refresh_token": new_refresh, "token_type": "bearer"}


@router.post("/repair-routerai")
@router.post("/repair-polza")
async def repair_polza_key(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Повторная автовыдача ключа Polza (MCP)."""
    tier = normalize_tier(current_user.subscription_tier)
    if not tier_requires_payment(tier) or not await enforce_paid_subscription(
        db, current_user, trigger="repair_polza"
    ):
        raise HTTPException(
            status_code=403,
            detail="Облачный ИИ доступен только после оплаты платного тарифа.",
        )
    from app.services.invoice_pool import get_user_period_pool_usd
    from app.services.polza import (
        provision_polza_for_user,
        sync_polza_key_limit_after_payment,
        user_has_polza_key,
    )

    pool_usd = float(get_user_period_pool_usd(db, current_user) or tier_monthly_cap(tier))
    pool_rub = usd_to_rub(pool_usd, get_usd_rub_rate_sync())

    if user_has_polza_key(current_user):
        ok = await sync_polza_key_limit_after_payment(current_user, pool_rub=pool_rub)
        if ok:
            db.commit()
            db.refresh(current_user)
            return {"status": "ok", "has_polza_key": True}
        ok = await provision_polza_for_user(current_user, db, pool_rub=pool_rub, force=True)
    else:
        ok = await provision_polza_for_user(current_user, db, pool_rub=pool_rub, force=False)
    db.refresh(current_user)
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Не удалось создать ключ ИИ. Проверьте POLZA_MCP_TOKEN на сервере или напишите в поддержку.",
        )
    return {"status": "ok", "has_polza_key": user_has_polza_key(current_user)}


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if is_testing_mode():
        await ensure_testing_subscription(db, current_user, tier=current_user.subscription_tier or "ULTRA")
    else:
        await enforce_paid_subscription(db, current_user, trigger="profile")
        db.refresh(current_user)
    return _profile_payload(current_user, db)
