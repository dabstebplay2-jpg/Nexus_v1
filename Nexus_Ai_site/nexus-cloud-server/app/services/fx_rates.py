"""Курс USD/RUB (официальный ЦБ РФ), обновление ежедневно по московской дате."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.database import FxRateDB, SessionLocal
from app.time_utils import utc_now

logger = logging.getLogger(__name__)


def _moscow_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("Europe/Moscow")
    except Exception:
        return timezone(timedelta(hours=3))


MOSCOW = _moscow_tz()
CBR_DAILY_JSON = os.environ.get("NEXUS_CBR_FX_URL", "https://www.cbr-xml-daily.ru/daily_json.js")
FALLBACK_USD_RUB = float(os.environ.get("NEXUS_FALLBACK_USD_RUB", "95.0"))
# Перезапрос к ЦБ, если запись старше N часов (ЦБ публикует курс ~11:30 МСК)
FX_STALE_HOURS = float(os.environ.get("NEXUS_FX_STALE_HOURS", "18"))

_memory_rate: Optional[float] = None
_memory_date: Optional[str] = None
_memory_meta: dict = {}


def moscow_today() -> str:
    return datetime.now(MOSCOW).date().isoformat()


def _parse_cbr_usd_rub(payload: dict) -> tuple[float, str | None]:
    usd = payload.get("Valute", {}).get("USD")
    if not usd:
        raise ValueError("USD not in CBR response")
    value = str(usd.get("Value", "")).replace(",", ".")
    nominal = float(usd.get("Nominal") or 1)
    rate = round(float(value) / nominal, 4)
    # Дата публикации из ответа ЦБ (ISO)
    pub = payload.get("Date")
    pub_date = None
    if pub:
        try:
            pub_date = datetime.fromisoformat(str(pub).replace("Z", "+00:00")).astimezone(MOSCOW).date().isoformat()
        except (TypeError, ValueError):
            pub_date = None
    return rate, pub_date


async def fetch_usd_rub_from_cbr() -> tuple[float, str | None]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(CBR_DAILY_JSON)
        response.raise_for_status()
        return _parse_cbr_usd_rub(response.json())


def _load_rate_row(db: Session, day: str) -> FxRateDB | None:
    return db.query(FxRateDB).filter(FxRateDB.rate_date == day).first()


def _latest_row(db: Session) -> FxRateDB | None:
    return db.query(FxRateDB).order_by(FxRateDB.rate_date.desc()).first()


def _is_stale(row: FxRateDB, today: str) -> bool:
    if row.rate_date != today:
        return True
    if (row.source or "") != "cbr":
        return True
    if not row.fetched_at:
        return True
    fetched = row.fetched_at
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - fetched.astimezone(timezone.utc)
    if age > timedelta(hours=FX_STALE_HOURS):
        return True
    # После 12:00 МСК убеждаемся, что есть сегодняшняя публикация ЦБ
    now_msk = datetime.now(MOSCOW)
    if now_msk.hour >= 12 and fetched.astimezone(MOSCOW).date() < now_msk.date():
        return True
    return False


def _save_rate_to_db(db: Session, day: str, rate: float, source: str = "cbr") -> FxRateDB:
    row = _load_rate_row(db, day)
    now = utc_now()
    if row:
        row.usd_rub = rate
        row.source = source
        row.fetched_at = now
    else:
        row = FxRateDB(
            rate_date=day,
            usd_rub=rate,
            source=source,
            fetched_at=now,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _apply_memory(row: FxRateDB) -> float:
    global _memory_rate, _memory_date, _memory_meta
    _memory_rate = float(row.usd_rub)
    _memory_date = row.rate_date
    _memory_meta = {
        "rate_date": row.rate_date,
        "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
        "source": row.source or "cbr",
    }
    return _memory_rate


def fx_rate_metadata() -> dict:
    if _memory_meta:
        return dict(_memory_meta)
    today = moscow_today()
    db = SessionLocal()
    try:
        row = _load_rate_row(db, today) or _latest_row(db)
        if not row:
            return {"rate_date": today, "source": "fallback", "fetched_at": None}
        return {
            "rate_date": row.rate_date,
            "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
            "source": row.source or "cbr",
        }
    finally:
        db.close()


async def refresh_usd_rub_rate(*, force: bool = False) -> float:
    """Загрузить курс ЦБ и сохранить на московскую дату."""
    global _memory_rate, _memory_date
    today = moscow_today()

    if not force and _memory_date == today and _memory_rate:
        return _memory_rate

    db = SessionLocal()
    try:
        row = _load_rate_row(db, today)
        if not force and row and not _is_stale(row, today):
            return _apply_memory(row)

        try:
            rate, pub_date = await fetch_usd_rub_from_cbr()
            store_day = pub_date or today
            source = "cbr"
            logger.info("CBR USD/RUB: %.4f (publish %s, store %s)", rate, pub_date, store_day)
        except Exception as exc:
            logger.warning("CBR FX fetch failed: %s", exc)
            fallback = _latest_row(db)
            rate = float(fallback.usd_rub) if fallback else FALLBACK_USD_RUB
            store_day = today
            source = "fallback"

        row = _save_rate_to_db(db, store_day, rate, source=source)
        # Дублируем на «сегодня» для быстрого lookup, если ЦБ отдал вчерашнюю метку
        if store_day != today:
            _save_rate_to_db(db, today, rate, source=source)
        return _apply_memory(row)
    finally:
        db.close()


def get_usd_rub_rate_sync() -> float:
    if _memory_rate:
        return _memory_rate
    today = moscow_today()
    db = SessionLocal()
    try:
        row = _load_rate_row(db, today) or _latest_row(db)
        if row:
            return float(row.usd_rub)
        return FALLBACK_USD_RUB
    finally:
        db.close()


def usd_to_rub(usd: float, rate: Optional[float] = None) -> float:
    r = rate if rate is not None else get_usd_rub_rate_sync()
    return round(float(usd) * r, 2)


def rub_to_usd(rub: float, rate: Optional[float] = None) -> float:
    r = rate if rate is not None else get_usd_rub_rate_sync()
    if r <= 0:
        return 0.0
    return round(float(rub) / r, 6)
