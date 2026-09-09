"""Legacy alias — cron проверки баланса Polza."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.polza_balance_cron import run_polza_balance_check


async def run_routerai_funding_check(db: Session) -> dict:
    return await run_polza_balance_check(db)
