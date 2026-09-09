"""Тарифы: подписка в ₽ + месячный пул ИИ на оплаченный период."""

from app.config import (
    TIER_MARKET_BADGES,
    TIER_MONTHLY_CAP_OVERRIDES,
    TIER_POOL_FRACTION,
    TIER_PRICES,
    TIER_QUOTA_MARKETING,
)

TIER_META = {
    "FREE": {"price_usd": TIER_PRICES["FREE"], "ai_enabled": True, "label_ru": "Free"},
    "HOBBY": {"price_usd": TIER_PRICES["HOBBY"], "ai_enabled": True, "label_ru": "Hobby"},
    "STANDARD": {"price_usd": TIER_PRICES["STANDARD"], "ai_enabled": True, "label_ru": "Standard"},
    "PRO": {"price_usd": TIER_PRICES["PRO"], "ai_enabled": True, "label_ru": "Pro"},
    "ULTRA": {"price_usd": TIER_PRICES["ULTRA"], "ai_enabled": True, "label_ru": "Ultra"},
}

TIER_ORDER = ["FREE", "HOBBY", "STANDARD", "PRO", "ULTRA"]


def normalize_tier(tier: str | None) -> str:
    t = (tier or "FREE").upper()
    return t if t in TIER_META else "FREE"


def tier_allows_ai(tier: str) -> bool:
    return TIER_META[normalize_tier(tier)]["ai_enabled"]


def tier_uses_openrouter_free(tier: str | None) -> bool:
    return normalize_tier(tier) == "FREE"


def tier_requires_payment(tier: str) -> bool:
    t = normalize_tier(tier)
    return tier_allows_ai(t) and tier_price(t) > 0 and tier_monthly_cap(t) > 0


def tier_credits(tier: str) -> float:
    return 0.0


def tier_price(tier: str) -> float:
    return TIER_META[normalize_tier(tier)]["price_usd"]


def tier_monthly_cap(tier: str) -> float:
    t = normalize_tier(tier)
    raw = (TIER_MONTHLY_CAP_OVERRIDES.get(t) or "").strip()
    if raw:
        try:
            return max(0.0, float(raw))
        except ValueError:
            pass
    price = tier_price(t)
    if price <= 0:
        return 0.0
    return round(price * TIER_POOL_FRACTION, 4)


def tier_daily_cap(tier: str) -> float:
    """Устарело: алиас месячного пула."""
    return tier_monthly_cap(tier)


def public_tiers_list(usd_rub: float) -> list[dict]:
    from app.services.fx_rates import usd_to_rub

    out = []
    for tid in TIER_ORDER:
        meta = TIER_META[tid]
        cap_usd = tier_monthly_cap(tid)
        cap_rub = usd_to_rub(cap_usd, usd_rub)
        price_rub = usd_to_rub(meta["price_usd"], usd_rub)
        hint = TIER_QUOTA_MARKETING.get(tid, "")
        pool_pct = (
            round(100.0 * cap_usd / meta["price_usd"], 1) if meta["price_usd"] > 0 and cap_usd > 0 else 0.0
        )
        out.append(
            {
                "id": tid,
                "name": meta["label_ru"],
                "price_usd": meta["price_usd"],
                "price_rub": price_rub,
                "monthly_cap_usd": cap_usd,
                "monthly_cap_rub": cap_rub,
                "monthly_quota_rub": cap_rub,
                "daily_cap_usd": cap_usd,
                "daily_cap_rub": cap_rub,
                "daily_quota_rub": cap_rub,
                "quota_hint": hint,
                "market_badge": (TIER_MARKET_BADGES.get(tid) or "").strip(),
                "pool_share_percent": pool_pct,
                "platform_margin_percent": round(max(0.0, 100.0 - pool_pct), 1),
                "credits_usd": 0,
                "credits_rub": 0,
                "ai_enabled": meta["ai_enabled"],
                "popular": tid == "STANDARD",
                "label": meta["label_ru"],
                "billing_mode": "monthly_quota",
            }
        )
    return out
