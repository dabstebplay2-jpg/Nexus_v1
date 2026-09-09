"""Обратная совместимость: дневные имена → месячный пул."""

from app.services.quota_limits import (  # noqa: F401
    DailyLimitExceeded,
    QuotaLimitExceeded,
    assert_daily_budget,
    assert_quota_budget,
    get_daily_limit_info,
    get_period_ai_spend,
    get_quota_limit_info,
    start_subscription_period,
)
