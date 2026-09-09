"""Telegram Login Widget + регистрация через бота."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
import uuid
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import NEXUS_FRONTEND_URL, TELEGRAM_BOT_TOKEN, telegram_bot_enabled
from app.database import UserDB
from app.services.auth_session import _add_auth_method, issue_tokens_and_setup
from app.services.google_oauth import (
    _issue_exchange_jwt,
    _resolve_exchange_claims,
    exchange_auth_code,
)
from app.services.telegram_link import (
    attach_telegram_to_user,
    get_user_by_telegram_id,
    is_tg_shadow_email,
)
from app.time_utils import utc_now

logger = logging.getLogger(__name__)

TG_EMAIL_DOMAIN = "tg.nexus"
TG_EMAIL_SUFFIX = f"@{TG_EMAIL_DOMAIN}"


def telegram_synthetic_email(telegram_id: int) -> str:
    return f"tg{int(telegram_id)}{TG_EMAIL_SUFFIX}"


def is_telegram_synthetic_email(email: str | None) -> bool:
    return (email or "").strip().lower().endswith(TG_EMAIL_SUFFIX)


def display_user_label(user: UserDB) -> str:
    from app.services.telegram_link import mask_email

    if is_telegram_synthetic_email(user.email):
        username = getattr(user, "telegram_username", None)
        if username:
            return f"@{username.lstrip('@')}"
        return "ваш Telegram-аккаунт"
    return mask_email(user.email)


def verify_telegram_login_widget(data: dict, *, max_age_sec: int = 86400) -> dict:
    """Проверка подписи Telegram Login Widget."""
    if not telegram_bot_enabled():
        raise ValueError("Telegram auth не настроен на сервере")

    recv_hash = (data.get("hash") or "").strip()
    if not recv_hash:
        raise ValueError("Нет подписи Telegram")

    pairs: list[str] = []
    for key in sorted(data.keys()):
        if key == "hash":
            continue
        pairs.append(f"{key}={data[key]}")
    data_check_string = "\n".join(pairs)
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    calc = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if calc != recv_hash:
        raise ValueError("Неверная подпись Telegram")

    try:
        auth_date = int(data.get("auth_date") or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("Некорректная дата авторизации Telegram") from exc
    if auth_date <= 0 or time.time() - auth_date > max_age_sec:
        raise ValueError("Сессия Telegram истекла. Войдите снова.")

    return data


async def find_or_create_telegram_user(
    db: Session,
    *,
    telegram_id: int,
    username: str | None = None,
    first_name: str | None = None,
) -> UserDB:
    tid = int(telegram_id)
    user = get_user_by_telegram_id(db, tid)
    if user:
        if username and username != getattr(user, "telegram_username", None):
            user.telegram_username = username.strip().lstrip("@") or None
            db.commit()
            db.refresh(user)
        return user

    email = telegram_synthetic_email(tid)
    existing_email = db.query(UserDB).filter(UserDB.email == email).first()
    if existing_email:
        if existing_email.telegram_id and int(existing_email.telegram_id) != tid:
            raise ValueError("Этот аккаунт уже привязан к другому Telegram.")
        existing_email.telegram_id = tid
        existing_email.telegram_username = (username or "").strip().lstrip("@") or None
        _add_auth_method(existing_email, "telegram")
        db.commit()
        db.refresh(existing_email)
        return existing_email

    user = UserDB(
        email=email,
        hashed_password="",
        telegram_id=tid,
        telegram_username=(username or "").strip().lstrip("@") or None,
        subscription_tier="FREE",
        balance=0.0,
        refresh_token="ref_" + str(uuid.uuid4()),
        auth_methods="telegram",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        again = get_user_by_telegram_id(db, tid)
        if again:
            return again
        raise ValueError("Не удалось создать аккаунт Telegram.") from exc
    db.refresh(user)
    return user


def issue_telegram_site_exchange(db: Session, user: UserDB) -> str:
    return _issue_exchange_jwt(user.id, user.email)


def build_site_login_url(exchange_code: str) -> str:
    base = NEXUS_FRONTEND_URL.rstrip("/")
    return f"{base}/auth/callback?exchange={quote(exchange_code, safe='')}"


async def login_via_telegram_widget(db: Session, widget_data: dict) -> dict:
    verified = verify_telegram_login_widget(widget_data)
    tid = int(verified["id"])
    user = await find_or_create_telegram_user(
        db,
        telegram_id=tid,
        username=verified.get("username"),
        first_name=verified.get("first_name"),
    )
    return await issue_tokens_and_setup(db, user)


async def exchange_telegram_auth_code(db: Session, exchange_code: str) -> dict:
    return await exchange_auth_code(db, exchange_code)


def preview_telegram_exchange(db: Session, exchange_code: str) -> dict:
    user_id, _email = _resolve_exchange_claims(db, exchange_code)
    if not user_id:
        raise ValueError("Ссылка входа недействительна или истекла.")
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        raise ValueError("Пользователь не найден.")
    return {
        "user_id": user.id,
        "is_telegram_shadow": is_tg_shadow_email(user.email),
        "telegram_username": getattr(user, "telegram_username", None),
        "label": display_user_label(user),
    }


def link_telegram_from_exchange(db: Session, current_user: UserDB, exchange_code: str) -> UserDB:
    user_id, _email = _resolve_exchange_claims(db, exchange_code)
    if not user_id:
        raise ValueError("Ссылка входа недействительна или истекла.")
    shadow = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not shadow:
        raise ValueError("Пользователь не найден.")
    if shadow.id == current_user.id:
        return current_user
    if not is_tg_shadow_email(shadow.email):
        raise ValueError(
            "Ссылка ведёт на другой полноценный аккаунт. "
            "Выйдите на сайте и нажмите «Открыть Nexus» снова, чтобы войти в него."
        )
    if not shadow.telegram_id:
        raise ValueError("В ссылке нет данных Telegram.")
    return attach_telegram_to_user(
        db,
        target=current_user,
        telegram_id=int(shadow.telegram_id),
        telegram_username=shadow.telegram_username,
    )


async def request_bind_email_code(
    db: Session, user: UserDB, new_email: str, client_ip: str | None
) -> dict:
    from app.services.email_login import normalize_email, request_login_code

    new_email = normalize_email(new_email)
    if is_telegram_synthetic_email(new_email):
        raise ValueError("Укажите обычный email, не служебный адрес Telegram.")
    if new_email == normalize_email(user.email):
        raise ValueError("Этот email уже привязан к аккаунту.")
    taken = db.query(UserDB).filter(UserDB.email == new_email, UserDB.id != user.id).first()
    if taken:
        raise ValueError("Этот email уже используется другим аккаунтом.")
    return await request_login_code(db, new_email, client_ip)


async def bind_email_for_telegram_user(
    db: Session, user: UserDB, new_email: str, code: str
) -> UserDB:
    from datetime import timedelta

    from app.config import AUTH_OTP_LOCK_MINUTES, AUTH_OTP_MAX_VERIFY_ATTEMPTS
    from app.database import LoginCodeDB
    from app.services.email_login import _code_hash, normalize_email

    new_email = normalize_email(new_email)
    code = (code or "").strip()
    if not is_telegram_synthetic_email(user.email):
        raise ValueError("Email уже указан.")
    if is_telegram_synthetic_email(new_email):
        raise ValueError("Укажите обычный email.")
    taken = db.query(UserDB).filter(UserDB.email == new_email, UserDB.id != user.id).first()
    if taken:
        raise ValueError("Этот email уже используется другим аккаунтом.")

    row = (
        db.query(LoginCodeDB)
        .filter(LoginCodeDB.email == new_email)
        .order_by(LoginCodeDB.id.desc())
        .first()
    )
    if not row:
        raise ValueError("Код недействителен. Запросите новый.")
    now = utc_now()
    if row.expires_at < now:
        db.delete(row)
        db.commit()
        raise ValueError("Код истёк. Запросите новый.")
    lock_until = row.created_at + timedelta(minutes=AUTH_OTP_LOCK_MINUTES)
    if row.attempts >= AUTH_OTP_MAX_VERIFY_ATTEMPTS and now < lock_until:
        raise ValueError("Слишком много попыток. Подождите 15 минут.")
    if _code_hash(new_email, code) != row.code_hash:
        row.attempts = (row.attempts or 0) + 1
        db.commit()
        raise ValueError("Неверный код.")

    db.delete(row)
    user.email = new_email
    user.email_verified_at = now
    _add_auth_method(user, "email_otp")
    db.commit()
    db.refresh(user)
    return user
