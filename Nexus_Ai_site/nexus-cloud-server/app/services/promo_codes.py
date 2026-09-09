"""Тестовые промокоды: выдача тарифа или скидка на оплату."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.tiers import normalize_tier

PromoAction = Literal["grant_tier", "discount"]


@dataclass(frozen=True)
class PromoDef:
    code: str
    action: PromoAction
    tier: str | None = None
    discount_percent: int = 0
    description: str = ""


def promo_codes_enabled() -> bool:
    import os

    explicit = os.environ.get("NEXUS_PROMO_CODES_ENABLED", "").strip().lower()
    if explicit in ("0", "false", "no"):
        return False
    if explicit in ("1", "true", "yes"):
        return True
    # По умолчанию выключено; локально: NEXUS_PROMO_CODES_ENABLED=true
    return False


# Коды для тестирования подписок (регистр не важен)
_PROMOS: dict[str, PromoDef] = {
    "NEXUS-HOBBY": PromoDef("NEXUS-HOBBY", "grant_tier", "HOBBY", 0, "Тариф Hobby на 30 дней"),
    "NEXUS-STANDARD": PromoDef(
        "NEXUS-STANDARD", "grant_tier", "STANDARD", 0, "Тариф Standard на 30 дней"
    ),
    "NEXUS-PRO": PromoDef("NEXUS-PRO", "grant_tier", "PRO", 0, "Тариф Pro на 30 дней"),
    "NEXUS-ULTRA": PromoDef("NEXUS-ULTRA", "grant_tier", "ULTRA", 0, "Тариф Ultra на 30 дней"),
    "NEXUS-FREE": PromoDef("NEXUS-FREE", "grant_tier", "FREE", 0, "Сброс на Free"),
    "NEXUS-50": PromoDef("NEXUS-50", "discount", None, 50, "Скидка 50% на следующую оплату"),
    "NEXUS-90": PromoDef("NEXUS-90", "discount", None, 90, "Скидка 90% на следующую оплату"),
}


def normalize_promo_code(raw: str) -> str:
    return (raw or "").strip().upper().replace(" ", "")


def lookup_promo(raw: str) -> PromoDef | None:
    key = normalize_promo_code(raw)
    if not key:
        return None
    return _PROMOS.get(key)


def public_promo_hints() -> list[dict]:
    if not promo_codes_enabled():
        return []
    return [
        {
            "code": p.code,
            "action": p.action,
            "tier": normalize_tier(p.tier) if p.tier else None,
            "discount_percent": p.discount_percent,
            "description": p.description,
        }
        for p in _PROMOS.values()
    ]


def apply_discount(amount_rub: float, discount_percent: int) -> float:
    pct = max(0, min(100, int(discount_percent)))
    return round(float(amount_rub) * (100 - pct) / 100.0, 2)
