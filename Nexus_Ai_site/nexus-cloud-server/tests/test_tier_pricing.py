"""Цены и пул тарифов (сбалансированная сетка июнь 2026)."""

from app.config import TIER_MARKET_BADGES, TIER_POOL_FRACTION, TIER_PRICES
from app.tiers import public_tiers_list, tier_monthly_cap


def test_tier_usd_prices_balanced_anchors():
    assert TIER_PRICES["HOBBY"] == 10.0
    assert TIER_PRICES["STANDARD"] == 20.0
    assert TIER_PRICES["PRO"] == 100.0
    assert TIER_PRICES["ULTRA"] == 200.0


def test_monthly_pool_is_92_percent_of_price():
    for tid in ("HOBBY", "STANDARD", "PRO", "ULTRA"):
        price = TIER_PRICES[tid]
        cap = tier_monthly_cap(tid)
        assert cap == round(price * TIER_POOL_FRACTION, 4)


def test_public_tiers_include_market_badges():
    tiers = {t["id"]: t for t in public_tiers_list(80.0)}
    assert tiers["PRO"]["market_badge"] == TIER_MARKET_BADGES["PRO"]
    assert tiers["ULTRA"]["market_badge"] == TIER_MARKET_BADGES["ULTRA"]
    assert tiers["STANDARD"]["price_usd"] == 20.0
    assert tiers["PRO"]["monthly_cap_usd"] == round(100.0 * TIER_POOL_FRACTION, 4)


def test_billing_catalog_endpoint(client):
    res = client.get("/v1/billing/catalog")
    assert res.status_code == 200
    data = res.json()
    by_id = {t["id"]: t for t in data["tiers"]}
    assert by_id["STANDARD"]["price_usd"] == 20.0
    assert by_id["PRO"]["price_usd"] == 100.0
    assert by_id["ULTRA"]["price_usd"] == 200.0
    assert by_id["PRO"]["market_badge"] == "5× пул Standard"
