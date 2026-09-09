from types import SimpleNamespace

from app.services.billing_fulfillment import invoice_tier_from_id, resolve_invoice_tier
from app.tiers import tier_monthly_cap


def test_invoice_tier_from_id():
    assert invoice_tier_from_id("sub_PRO_a1b2c3d4") == "PRO"
    assert invoice_tier_from_id("sub_ULTRA_abc") == "ULTRA"
    assert invoice_tier_from_id("sub_HOBBY_abc123") == "HOBBY"


def test_resolve_invoice_tier_prefers_stored_column():
    inv = SimpleNamespace(id="sub_STANDARD_old", subscription_tier="HOBBY")
    assert resolve_invoice_tier(inv) == "HOBBY"


def test_pending_subscribe_pool_fields_match_credits():
    """Пул счёта = 92% от amount_rub, меньше каталога при скидке."""
    from app.config import TIER_POOL_FRACTION
    from app.services.fx_rates import rub_to_usd, usd_to_rub

    rate = 90.0
    amount_rub = 1440.0
    pool_usd = round(rub_to_usd(amount_rub, rate) * TIER_POOL_FRACTION, 4)
    pool_rub = usd_to_rub(pool_usd, rate)
    catalog_pool_rub = usd_to_rub(tier_monthly_cap("STANDARD"), rate)
    assert pool_usd == round((1440.0 / 90.0) * TIER_POOL_FRACTION, 4)
    assert pool_rub < catalog_pool_rub
