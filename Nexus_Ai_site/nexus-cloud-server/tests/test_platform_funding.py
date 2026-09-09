from types import SimpleNamespace

from app.services.platform_funding import compute_funding_metrics, record_payment_obligation


def test_record_payment_obligation_idempotent(db_session):
    inv = SimpleNamespace(id="sub_HOBBY_test1", amount_rub=743.0, credits_usd=9.3)
    a = record_payment_obligation(db_session, invoice=inv, pool_usd=9.3, user_id=1)
    b = record_payment_obligation(db_session, invoice=inv, pool_usd=9.3, user_id=1)
    assert a is not None
    assert b.id == a.id


def test_compute_funding_metrics_shortfall(db_session, monkeypatch):
    from app.database import PlatformSettingsDB
    from app.services import platform_funding as pf

    row = PlatformSettingsDB(id=1, polza_org_balance_rub=500.0)
    db_session.add(row)
    db_session.commit()

    from app.services import routerai_pool_monitor as rpm

    monkeypatch.setattr(
        rpm,
        "aggregate_user_pool_usd",
        lambda _db: {"total_pool_usd": 20.0, "total_pool_rub": 1500, "active_subscribers": 2},
    )
    monkeypatch.setattr(pf, "sum_obligations_usd", lambda _db: 20.0)
    monkeypatch.setattr(pf, "sum_received_rub_month", lambda _db: 1500.0)
    monkeypatch.setattr(pf, "get_usd_rub_rate_sync", lambda: 75.0)

    m = compute_funding_metrics(db_session)
    assert m["polza_org_balance_rub"] == 500.0
    assert m["reserved_pool_usd"] == 20.0
    assert m["required_balance_rub"] == 1500.0
    assert m["recommended_topup_rub"] == 1000.0
    assert m["funding_ok"] is False
