"""Render Cron: проверка баланса Polza.org и Discord ops-алерт."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.services.polza_balance_cron import run_polza_balance_check


async def main() -> None:
    db = SessionLocal()
    try:
        result = await run_polza_balance_check(db)
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
