import json

from sqlalchemy.orm import Session

from app.config import DEFAULT_COST, MARGIN_MULTIPLIER, MODEL_COSTS
from app.database import TransactionDB, UserDB
from app.services.models_registry import get_pricing_for_billing
from app.services.polza import get_user_polza_key
from app.services.quota_limits import assert_quota_budget, get_quota_limit_info
from app.tiers import normalize_tier, tier_allows_ai, tier_monthly_cap


def estimate_usage_cost(model: str, usage: dict | None) -> float:
    if not usage:
        return 0.0
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    dynamic = get_pricing_for_billing(model)
    rates = dynamic if dynamic and dynamic.get("input") is not None else MODEL_COSTS.get(model, DEFAULT_COST)
    cost_raw = (prompt_tokens * rates["input"]) + (completion_tokens * rates["output"])
    return max(0.0001, round(cost_raw * MARGIN_MULTIPLIER, 6))


async def apply_usage_billing(db: Session, user: UserDB, *, model: str, usage: dict | None) -> dict | None:
    """Списывает сначала из лимита подписки, а превышение — с баланса пользователя."""
    if not usage:
        return None
    cost_final = estimate_usage_cost(model, usage)
    assert_quota_budget(db, user, projected_cost=cost_final)
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)

    usage_payload = {
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }

    from app.services.invoice_pool import get_user_period_pool_usd
    from app.services.quota_limits import (
        get_billing_period_start,
        get_period_ai_spend,
        is_subscription_period_expired,
    )

    tier = normalize_tier(user.subscription_tier)
    sub_cap = get_user_period_pool_usd(db, user) or tier_monthly_cap(tier)
    if not tier_allows_ai(tier):
        sub_cap = 0.0

    period_start = get_billing_period_start(user)
    if is_subscription_period_expired(user):
        remaining_sub = 0.0
    elif sub_cap > 0 and period_start:
        spent_sub = get_period_ai_spend(db, user)
        remaining_sub = max(0.0, sub_cap - spent_sub)
    else:
        remaining_sub = 0.0

    if remaining_sub >= cost_final:
        db.add(
            TransactionDB(
                user_id=user.id,
                amount=-cost_final,
                tx_type="AI_SPEND",
                description=f"Квота: {model} ({prompt_tokens}+{completion_tokens} tok)",
                usage_json=json.dumps(usage_payload, ensure_ascii=False),
            )
        )
    else:
        sub_part = remaining_sub
        balance_part = cost_final - sub_part

        if sub_part > 0:
            db.add(
                TransactionDB(
                    user_id=user.id,
                    amount=-sub_part,
                    tx_type="AI_SPEND",
                    description=f"Квота: {model} ({prompt_tokens}+{completion_tokens} tok) [часть подписки]",
                    usage_json=json.dumps(usage_payload, ensure_ascii=False),
                )
            )

        user.balance = max(0.0, round(user.balance - balance_part, 6))
        db.add(
            TransactionDB(
                user_id=user.id,
                amount=-balance_part,
                tx_type="BALANCE_SPEND",
                description=f"Баланс: {model} ({prompt_tokens}+{completion_tokens} tok) [списание с баланса]",
                usage_json=json.dumps(usage_payload, ensure_ascii=False),
            )
        )

    db.commit()

    quota = get_quota_limit_info(db, user)
    return {
        "deducted_usd": cost_final,
        "billing_mode": "monthly_quota",
        "polza_key_mode": "user" if get_user_polza_key(user) else "blocked",
        "quota": quota,
        "daily": quota,
    }
