"""Агрегация usage-stats из транзакций AI_SPEND."""

import json
from datetime import timedelta

from app.database import SessionLocal, TransactionDB, UserDB
from app.services.usage_stats import _parse_transaction, aggregate_usage_stats
from app.time_utils import utc_now


def test_parse_transaction_from_description():
    tx = TransactionDB(
        user_id=1,
        amount=-0.01,
        tx_type="AI_SPEND",
        description="Квота: gpt-4o (120+80 tok)",
    )
    assert _parse_transaction(tx) == ("gpt-4o", 120, 80)


def test_parse_transaction_from_usage_json():
    tx = TransactionDB(
        user_id=1,
        amount=-0.02,
        tx_type="AI_SPEND",
        description="Квота: kimi (10+5 tok)",
        usage_json=json.dumps(
            {"model": "kimi-thinking", "prompt_tokens": 10, "completion_tokens": 5}
        ),
    )
    assert _parse_transaction(tx) == ("kimi-thinking", 10, 5)


def test_aggregate_usage_stats_sums_by_model():
    from app.database import migrate_schema

    migrate_schema()
    db = SessionLocal()
    try:
        import uuid

        user = UserDB(
            email=f"usage-stats-{uuid.uuid4().hex[:8]}@test.local",
            hashed_password="x",
            subscription_tier="STANDARD",
            subscription_period_start=utc_now() - timedelta(days=1),
            subscription_period_end=utc_now() + timedelta(days=29),
        )
        db.add(user)
        db.flush()

        db.add(
            TransactionDB(
                user_id=user.id,
                amount=-0.05,
                tx_type="AI_SPEND",
                description="Квота: model-a (100+50 tok)",
            )
        )
        db.add(
            TransactionDB(
                user_id=user.id,
                amount=-0.03,
                tx_type="AI_SPEND",
                description="Квота: model-a (20+10 tok)",
                usage_json=json.dumps(
                    {"model": "model-a", "prompt_tokens": 20, "completion_tokens": 10}
                ),
            )
        )
        db.add(
            TransactionDB(
                user_id=user.id,
                amount=-0.02,
                tx_type="AI_SPEND",
                description="Квота: model-b (5+5 tok)",
            )
        )
        db.commit()
        db.refresh(user)

        stats = aggregate_usage_stats(db, user)
        assert stats["prompt_tokens"] == 125
        assert stats["completion_tokens"] == 65
        assert stats["total_tokens"] == 190
        assert stats["request_count"] == 3
        assert stats["spent_usd"] == round(0.05 + 0.03 + 0.02, 6)

        by_model = {m["model"]: m for m in stats["by_model"]}
        assert by_model["model-a"]["requests"] == 2
        assert by_model["model-a"]["prompt_tokens"] == 120
        assert by_model["model-b"]["completion_tokens"] == 5
    finally:
        db.rollback()
        db.close()
