"""Тесты аудита биллинга: пул при промо, quota_enabled, истечение периода."""

from datetime import timedelta

from app.config import TIER_POOL_FRACTION
from app.database import InvoiceDB, UserDB
from app.services.fx_rates import rub_to_usd
from app.services.promo_redeem import resolve_subscribe_discount
from app.services.quota_limits import get_quota_limit_info, start_subscription_period
from app.tiers import tier_monthly_cap
from app.time_utils import utc_now


def test_discounted_pool_is_92_percent_of_paid_rub():
    """Пул = 92% от фактической суммы счёта (меньше каталога при скидке)."""
    rate = 90.0
    full_rub = 1800.0
    amount_rub, promo = resolve_subscribe_discount(None, full_rub)
    assert promo is None
    assert amount_rub == full_rub

    discounted_rub = full_rub * 0.8
    pool_usd = round(rub_to_usd(discounted_rub, rate) * TIER_POOL_FRACTION, 4)
    catalog_usd = tier_monthly_cap("STANDARD")
    assert pool_usd < catalog_usd
    assert pool_usd == round((discounted_rub / rate) * TIER_POOL_FRACTION, 4)


def test_quota_enabled_after_paid_invoice_without_period(db_session):
    """Оплаченный счёт без period_start — sync восстанавливает период."""
    user = db_session.query(UserDB).filter(UserDB.id == 1).first()
    user.subscription_tier = "STANDARD"
    user.subscription_period_start = None
    user.subscription_period_end = None
    user.balance = 0.0
    db_session.commit()

    inv = InvoiceDB(
        id="sub_STANDARD_quota1",
        user_id=user.id,
        amount_rub=1614.0,
        amount=1614.0,
        credits_usd=18.4,
        status="paid",
        subscription_tier="STANDARD",
    )
    db_session.add(inv)
    db_session.commit()

    info = get_quota_limit_info(db_session, user)
    assert info["quota_enabled"] is True
    assert info["subscription_cap_usd"] > 0
    assert user.subscription_period_start is not None


def test_expired_period_blocks_subscription_pool(db_session):
    """После period_end пул подписки не тратится; top-up остаётся."""
    user = db_session.query(UserDB).filter(UserDB.id == 1).first()
    user.subscription_tier = "STANDARD"
    user.balance = 5.0
    start_subscription_period(user, db_session, days=30)
    user.subscription_period_start = utc_now() - timedelta(days=40)
    user.subscription_period_end = utc_now() - timedelta(days=10)
    db_session.commit()

    inv = InvoiceDB(
        id="sub_STANDARD_expired1",
        user_id=user.id,
        amount_rub=1614.0,
        amount=1614.0,
        credits_usd=18.4,
        status="paid",
        subscription_tier="STANDARD",
        created_at=user.subscription_period_start,
    )
    db_session.add(inv)
    db_session.commit()

    info = get_quota_limit_info(db_session, user)
    assert info["period_expired"] is True
    assert info["subscription_remaining_usd"] == 0.0
    assert info["cap_usd"] == 5.0
    assert info["quota_enabled"] is True
