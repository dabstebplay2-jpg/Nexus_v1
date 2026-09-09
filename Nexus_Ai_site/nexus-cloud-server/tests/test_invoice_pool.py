from datetime import timedelta
from types import SimpleNamespace

from app.services.invoice_pool import (
    get_user_period_pool_usd,
    invoice_pool_usd,
    is_subscription_pool_invoice,
    persist_invoice_pool_usd,
)


def test_invoice_pool_usd_from_amount_rub():
    inv = SimpleNamespace(
        id="sub_HOBBY_abc",
        subscription_tier="HOBBY",
        amount_rub=743.0,
        credits_usd=0,
    )
    pool = invoice_pool_usd(inv, rate=74.3)
    assert pool == round((743.0 / 74.3) * 0.92, 4)


def test_invoice_pool_usd_uses_stored_credits():
    inv = SimpleNamespace(
        id="sub_HOBBY_abc",
        subscription_tier="HOBBY",
        amount_rub=743.0,
        credits_usd=8.5,
    )
    assert invoice_pool_usd(inv) == 8.5


def test_is_subscription_pool_invoice_excludes_topup():
    sub = SimpleNamespace(id="sub_STANDARD_abc", subscription_tier="STANDARD")
    top = SimpleNamespace(id="topup_deadbeef", subscription_tier="TOPUP")
    assert is_subscription_pool_invoice(sub) is True
    assert is_subscription_pool_invoice(top) is False


def test_get_user_period_pool_usd_ignores_topup_invoice(db_session, monkeypatch):
    from app.database import InvoiceDB, UserDB
    from app.services.quota_limits import start_subscription_period

    user = UserDB(
        email="pool-test@example.com",
        hashed_password="x",
        subscription_tier="STANDARD",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    start_subscription_period(user, db_session, days=30)
    db_session.commit()
    db_session.refresh(user)

    sub_inv = InvoiceDB(
        id="sub_STANDARD_test1",
        user_id=user.id,
        amount_rub=1614.0,
        amount=1614.0,
        credits_usd=18.4,
        status="paid",
        subscription_tier="STANDARD",
        created_at=user.subscription_period_start + timedelta(minutes=5),
    )
    topup_inv = InvoiceDB(
        id="topup_test1",
        user_id=user.id,
        amount_rub=100.0,
        amount=100.0,
        credits_usd=0.92,
        status="paid",
        subscription_tier="TOPUP",
        created_at=user.subscription_period_start + timedelta(minutes=10),
    )
    db_session.add_all([sub_inv, topup_inv])
    db_session.commit()

    pool = get_user_period_pool_usd(db_session, user)
    assert pool == 18.4


def test_persist_invoice_pool_usd_writes_credits():
    inv = SimpleNamespace(
        id="sub_STANDARD_x",
        subscription_tier="STANDARD",
        amount_rub=1500.0,
        credits_usd=0,
    )
    pool = persist_invoice_pool_usd(inv, rate=75.0)
    assert inv.credits_usd == pool
    assert pool > 0
