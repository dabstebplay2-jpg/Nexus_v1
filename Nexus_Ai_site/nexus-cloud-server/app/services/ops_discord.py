"""Ops-уведомления в Discord (отдельно от changelog)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import DISCORD_OPS_WEBHOOK_URL

logger = logging.getLogger(__name__)


async def send_ops_discord_message(content: str, *, embed: dict[str, Any] | None = None) -> bool:
    url = (DISCORD_OPS_WEBHOOK_URL or "").strip()
    if not url:
        logger.warning("DISCORD_OPS_WEBHOOK_URL не задан — ops-алерт не отправлен")
        return False
    payload: dict[str, Any] = {"content": content[:2000]}
    if embed:
        payload["embeds"] = [embed]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json=payload)
        if r.status_code >= 400:
            logger.error("Discord ops webhook %s: %s", r.status_code, r.text[:300])
            return False
        return True
    except Exception as exc:
        logger.error("Discord ops webhook failed: %s", exc)
        return False


async def send_polza_balance_alert(metrics: dict[str, Any]) -> bool:
    topup_rub = metrics.get("recommended_topup_rub", 0)
    balance_rub = metrics.get("polza_org_balance_rub", metrics.get("routerai_deposit_rub", 0))
    reserved_rub = metrics.get("reserved_pool_rub", 0)
    received = metrics.get("received_rub_month", 0)
    subs = metrics.get("active_subscribers", 0)
    frac = metrics.get("tier_pool_fraction", 0.92)

    embed = {
        "title": "Пополните баланс Polza.ai",
        "description": (
            "Организация Polza: баланс ниже суммы пулов подписчиков. "
            f"После ЮKassa лимиты ключей синхронизируются автоматически ({int(frac * 100)}% от тарифа)."
        ),
        "color": 0xF59E0B,
        "fields": [
            {"name": "Баланс org Polza", "value": f"{balance_rub:,.0f} ₽".replace(",", " "), "inline": True},
            {"name": "Под подписки (пулы)", "value": f"{reserved_rub:,.0f} ₽".replace(",", " "), "inline": True},
            {"name": "Пополнить org", "value": f"**{topup_rub:,.0f} ₽**".replace(",", " "), "inline": False},
            {"name": "ЮKassa за месяц", "value": f"{received:,.0f} ₽".replace(",", " "), "inline": True},
            {"name": "Подписчиков", "value": str(subs), "inline": True},
        ],
    }
    return await send_ops_discord_message(
        "⚠️ **Nexus ops:** низкий баланс Polza.ai — пополните polza.ai/dashboard → Биллинг",
        embed=embed,
    )


async def send_routerai_funding_alert(metrics: dict[str, Any]) -> bool:
    """Legacy alias."""
    return await send_polza_balance_alert(metrics)
