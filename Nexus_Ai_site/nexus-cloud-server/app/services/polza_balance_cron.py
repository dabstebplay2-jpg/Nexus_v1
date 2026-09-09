"""Проверка баланса org Polza.ai и ops-алерт."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.services.ops_discord import send_polza_balance_alert
from app.services.platform_funding import (
    mark_funding_alert_sent,
    refresh_polza_org_balance,
    should_send_funding_alert,
)

logger = logging.getLogger(__name__)


async def run_polza_balance_check(db: Session) -> dict:
    await refresh_polza_org_balance(db)
    send, metrics = should_send_funding_alert(db)
    result = {
        "metrics": metrics,
        "alert_sent": False,
        "alert_skipped": not send,
    }
    if not send:
        if metrics.get("funding_ok"):
            logger.info(
                "[POLZA: CRON] баланс OK org=%.0f ₽ reserved=%.0f ₽",
                metrics.get("polza_org_balance_rub", 0),
                metrics.get("reserved_pool_rub", 0),
            )
        return result

    ok = await send_polza_balance_alert(metrics)
    if ok:
        mark_funding_alert_sent(db)
        result["alert_sent"] = True
        logger.warning(
            "[POLZA: CRON] алерт отправлен topup=%.0f ₽ org=%.0f ₽",
            metrics.get("recommended_topup_rub", 0),
            metrics.get("polza_org_balance_rub", 0),
        )
    else:
        result["alert_error"] = "discord_webhook_failed_or_missing"
    return result
