"""Автообновление user_memory при явных просьбах в чате («запомни…» / «забудь…»)."""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.orm import Session

from app import models_catalog
from app.database import SessionLocal, UserDB, UserMemoryDB
from app.services.ai_billing import apply_usage_billing
from app.services.auth_rate_limit import check_rate_limit
from app.services.polza import PolzaError, PolzaService, require_inference_api_key
from app.services.quota_limits import QuotaLimitExceeded, assert_quota_budget
from app.services.user_memory import MAX_MEMORY_CHARS, get_memory_row, save_memory

logger = logging.getLogger(__name__)
_polza = PolzaService()

_LEARN_TRIGGERS = re.compile(
    r"(?i)"
    r"(?:"
    r"запомни|не\s+забудь|сохрани\s+в\s+память|"
    r"remember|don'?t\s+forget|save\s+to\s+memory"
    r")"
)

_FORGET_TRIGGERS = re.compile(
    r"(?i)"
    r"(?:"
    r"удали\s+(?:из\s+)?памят|убери\s+(?:из\s+)?памят|"
    r"больше\s+не\s+помни|не\s+помни\s+(?:что|про)|забыть\s+про|"
    r"\bзабудь\b|"
    r"\bforget\b|remove\s+from\s+memory|delete\s+from\s+memory|"
    r"stop\s+remembering|очисти\s+память|сотри\s+память"
    r")"
)

EXTRACT_SYSTEM = (
    "Ты извлекаешь факты для долгосрочной памяти ИИ-ассистента. "
    "Пользователь ЯВНО попросил что-то запомнить. "
    "Верни только новые факты в виде маркированного списка (строки с «- »). "
    "Формулируй в третьем лице: «Пользователя зовут…», «Пользователь предпочитает…». "
    "Не включай вопросы, болтовню и то, о чём пользователь не просил запомнить. "
    "Если сохранять нечего — ответь ровно одним словом: EMPTY. "
    "Не больше 1500 символов."
)

FORGET_EXTRACT_SYSTEM = (
    "Ты редактируешь долгосрочную память ИИ-ассистента. "
    "Пользователь ЯВНО попросил что-то забыть или удалить из памяти. "
    "Ниже текущая память. Верни только строки из этой памяти, которые нужно УДАЛИТЬ "
    "(копируй формулировки из памяти максимально близко, по одной строке с «- »). "
    "Если пользователь просит забыть всё — ответь ровно: CLEAR_ALL. "
    "Если в памяти нет подходящего или удалять нечего — ответь: EMPTY. "
    "Не больше 1500 символов."
)


def should_forget_from_user_text(text: str | None) -> bool:
    if not text or not str(text).strip():
        return False
    t = str(text)
    if re.search(r"(?i)не\s+забудь", t):
        return False
    return bool(_FORGET_TRIGGERS.search(t))


def should_learn_from_user_text(text: str | None) -> bool:
    if not text or not str(text).strip():
        return False
    if should_forget_from_user_text(text):
        return False
    return bool(_LEARN_TRIGGERS.search(str(text)))


def should_update_memory_from_user_text(text: str | None) -> bool:
    return should_forget_from_user_text(text) or should_learn_from_user_text(text)


def _normalize_line(line: str) -> str:
    s = line.strip()
    s = re.sub(r"^[-*•]\s*", "", s)
    return s.strip().lower()


def merge_memory_content(current: str, new_facts: str) -> str:
    """Добавляет новые буллеты к памяти, убирает точные дубликаты."""
    existing_lines = [ln.strip() for ln in (current or "").splitlines() if ln.strip()]
    seen = {_normalize_line(ln) for ln in existing_lines}

    new_lines: list[str] = []
    for raw in (new_facts or "").splitlines():
        line = raw.strip()
        if not line or line.upper() == "EMPTY":
            continue
        if not line.startswith(("-", "*", "•")):
            line = f"- {line}"
        key = _normalize_line(line)
        if key and key not in seen:
            seen.add(key)
            new_lines.append(line)

    if not new_lines:
        return (current or "")[:MAX_MEMORY_CHARS]

    merged = "\n".join([*existing_lines, *new_lines]).strip()
    if len(merged) > MAX_MEMORY_CHARS:
        merged = merged[:MAX_MEMORY_CHARS].rsplit("\n", 1)[0].strip()
    return merged


def _line_matches_forget(line: str, forget_keys: set[str]) -> bool:
    norm = _normalize_line(line)
    if not norm:
        return False
    for fk in forget_keys:
        if not fk:
            continue
        if norm == fk:
            return True
        if len(fk) >= 6 and (fk in norm or norm in fk):
            return True
        # ключевые слова из запроса на удаление (имя, факт)
        for token in re.findall(r"[a-zа-яё0-9]{4,}", fk, flags=re.I):
            if token.lower() in norm:
                return True
    return False


def apply_forget_to_memory(current: str, forget_spec: str) -> str:
    """Удаляет строки памяти по списку от модели или CLEAR_ALL."""
    spec = (forget_spec or "").strip()
    if spec.upper() == "CLEAR_ALL":
        return ""
    if not spec or spec.upper() == "EMPTY":
        return (current or "")[:MAX_MEMORY_CHARS]

    forget_keys: set[str] = set()
    for raw in spec.splitlines():
        line = raw.strip()
        if not line or line.upper() in ("EMPTY", "CLEAR_ALL"):
            continue
        forget_keys.add(_normalize_line(line))

    existing_lines = [ln.strip() for ln in (current or "").splitlines() if ln.strip()]
    if not forget_keys:
        return (current or "")[:MAX_MEMORY_CHARS]

    kept = [ln for ln in existing_lines if not _line_matches_forget(ln, forget_keys)]
    return "\n".join(kept).strip()[:MAX_MEMORY_CHARS]


def is_auto_learn_enabled(db: Session, user_id: int) -> bool:
    row = db.query(UserMemoryDB).filter(UserMemoryDB.user_id == user_id).first()
    if row is None:
        return True
    if not row.enabled:
        return False
    return bool(row.auto_learn)


def is_memory_enabled(db: Session, user_id: int) -> bool:
    row = get_memory_row(db, user_id)
    return bool(row.enabled)


async def extract_facts_from_turn(
    *,
    user: UserDB,
    db: Session,
    user_text: str,
    assistant_text: str,
    current_memory: str,
) -> str | None:
    model = await models_catalog.get_default_model(user.subscription_tier, prefer="cheap")
    try:
        api_key = require_inference_api_key(user)
    except PolzaError as exc:
        logger.warning("memory auto-learn: no api key user=%s: %s", user.id, exc)
        return None

    user_block = (user_text or "")[:2000]
    asst_block = (assistant_text or "")[:2000]
    mem_hint = (current_memory or "")[:1500]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": EXTRACT_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Текущая память (контекст, не переписывай целиком):\n{mem_hint or '(пусто)'}\n\n"
                    f"Сообщение пользователя:\n{user_block}\n\n"
                    f"Ответ ассистента:\n{asst_block}"
                ),
            },
        ],
    }
    try:
        response = await _polza.chat_completions(api_key, body, timeout=60.0)
    except Exception:
        logger.exception("memory auto-learn extract failed user=%s", user.id)
        return None
    if response.status_code != 200:
        logger.warning(
            "memory auto-learn extract HTTP %s user=%s",
            response.status_code,
            user.id,
        )
        return None

    data = response.json()
    try:
        await apply_usage_billing(db, user, model=model, usage=data.get("usage"))
    except Exception:
        logger.exception("memory auto-learn billing user=%s", user.id)

    choice = data.get("choices", [{}])[0]
    reply = (choice.get("message", {}) or {}).get("content", "") or ""
    text = reply.strip()
    if not text or text.upper() == "EMPTY":
        return None
    return text[:1500]


async def extract_forget_from_turn(
    *,
    user: UserDB,
    db: Session,
    user_text: str,
    assistant_text: str,
    current_memory: str,
) -> str | None:
    if not (current_memory or "").strip():
        return None

    model = await models_catalog.get_default_model(user.subscription_tier, prefer="cheap")
    try:
        api_key = require_inference_api_key(user)
    except PolzaError as exc:
        logger.warning("memory auto-forget: no api key user=%s: %s", user.id, exc)
        return None

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": FORGET_EXTRACT_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Текущая память:\n{current_memory[:4000]}\n\n"
                    f"Просьба пользователя:\n{(user_text or '')[:2000]}\n\n"
                    f"Ответ ассистента (контекст):\n{(assistant_text or '')[:1000]}"
                ),
            },
        ],
    }
    try:
        response = await _polza.chat_completions(api_key, body, timeout=60.0)
    except Exception:
        logger.exception("memory auto-forget extract failed user=%s", user.id)
        return None
    if response.status_code != 200:
        return None

    data = response.json()
    try:
        await apply_usage_billing(db, user, model=model, usage=data.get("usage"))
    except Exception:
        logger.exception("memory auto-forget billing user=%s", user.id)

    choice = data.get("choices", [{}])[0]
    reply = (choice.get("message", {}) or {}).get("content", "") or ""
    text = reply.strip()
    if not text or text.upper() == "EMPTY":
        return None
    return text[:1500]


async def forget_from_turn(
    db: Session,
    user_id: int,
    *,
    user_text: str,
    assistant_text: str,
) -> bool:
    if not should_forget_from_user_text(user_text):
        return False
    if not is_memory_enabled(db, user_id) or not is_auto_learn_enabled(db, user_id):
        return False
    if not check_rate_limit(f"memory_autolearn:user:{user_id}", 30, 3600.0):
        return False

    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        return False

    try:
        assert_quota_budget(db, user)
    except QuotaLimitExceeded:
        return False

    row = get_memory_row(db, user_id)
    current = row.content or ""
    forget_spec = await extract_forget_from_turn(
        user=user,
        db=db,
        user_text=user_text,
        assistant_text=assistant_text,
        current_memory=current,
    )
    if not forget_spec:
        return False

    merged = apply_forget_to_memory(current, forget_spec)
    if merged == current:
        return False

    save_memory(db, user_id, content=merged, enabled=bool(row.enabled), auto_learn=bool(row.auto_learn))
    logger.info("memory auto-forget updated user=%s (%d -> %d chars)", user_id, len(current), len(merged))
    return True


async def learn_from_turn(
    db: Session,
    user_id: int,
    *,
    user_text: str,
    assistant_text: str,
) -> bool:
    """Извлекает и сливает факты в user_memory. Возвращает True если память обновлена."""
    if not should_learn_from_user_text(user_text):
        return False
    if not is_memory_enabled(db, user_id) or not is_auto_learn_enabled(db, user_id):
        return False
    if not check_rate_limit(f"memory_autolearn:user:{user_id}", 30, 3600.0):
        logger.info("memory auto-learn rate limited user=%s", user_id)
        return False

    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        return False

    try:
        assert_quota_budget(db, user)
    except QuotaLimitExceeded:
        logger.info("memory auto-learn quota exceeded user=%s", user_id)
        return False

    row = get_memory_row(db, user_id)
    current = row.content or ""
    facts = await extract_facts_from_turn(
        user=user,
        db=db,
        user_text=user_text,
        assistant_text=assistant_text,
        current_memory=current,
    )
    if not facts:
        return False

    merged = merge_memory_content(current, facts)
    if merged == current:
        return False

    save_memory(db, user_id, content=merged, enabled=bool(row.enabled), auto_learn=bool(row.auto_learn))
    logger.info("memory auto-learn updated user=%s (+ %d chars)", user_id, len(merged) - len(current))
    return True


def last_user_message_text(messages: list[Any]) -> str:
    for msg in reversed(messages or []):
        role = getattr(msg, "role", None) or (msg.get("role") if isinstance(msg, dict) else None)
        if role != "user":
            continue
        content = getattr(msg, "content", None) if not isinstance(msg, dict) else msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(str(part.get("text") or ""))
            return " ".join(parts).strip()
        return str(content or "").strip()
    return ""


async def update_memory_from_turn(
    db: Session,
    user_id: int,
    *,
    user_text: str,
    assistant_text: str,
) -> bool:
    """Сначала забывание, затем запоминание (не оба за один ход)."""
    if should_forget_from_user_text(user_text):
        return await forget_from_turn(
            db, user_id, user_text=user_text, assistant_text=assistant_text
        )
    if should_learn_from_user_text(user_text):
        return await learn_from_turn(
            db, user_id, user_text=user_text, assistant_text=assistant_text
        )
    return False


def schedule_learn_from_turn(
    user_id: int,
    user_text: str,
    assistant_text: str,
) -> None:
    """Фоновая задача с отдельной сессией БД."""
    import asyncio

    async def _run() -> None:
        db = SessionLocal()
        try:
            updated = await update_memory_from_turn(
                db,
                user_id,
                user_text=user_text,
                assistant_text=assistant_text,
            )
            if updated:
                db.commit()
            else:
                db.rollback()
        except Exception:
            logger.exception("memory auto-update task failed user=%s", user_id)
            db.rollback()
        finally:
            db.close()

    asyncio.create_task(_run())
