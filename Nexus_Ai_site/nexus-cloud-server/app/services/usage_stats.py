"""Агрегация токенов и расхода по AI_SPEND за текущий период подписки."""

from __future__ import annotations

import json
import re
from collections import defaultdict

from sqlalchemy.orm import Session

from app.database import TransactionDB, UserDB
from app.services.fx_rates import get_usd_rub_rate_sync, usd_to_rub
from app.services.quota_limits import get_billing_period_end, get_billing_period_start
from app.time_utils import utc_now

_TX_DESC_RE = re.compile(
    r"Квота:\s*(.+?)\s*\((\d+)\+(\d+)\s*tok\)",
    re.IGNORECASE,
)


def _parse_transaction(tx: TransactionDB) -> tuple[str, int, int] | None:
    raw = getattr(tx, "usage_json", None)
    if raw:
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            model = str(data.get("model") or "").strip()
            prompt = int(data.get("prompt_tokens") or 0)
            completion = int(data.get("completion_tokens") or 0)
            if model:
                return model, prompt, completion
        except (TypeError, ValueError, json.JSONDecodeError):
            pass

    desc = tx.description or ""
    m = _TX_DESC_RE.search(desc)
    if not m:
        return None
    model = m.group(1).strip()
    return model, int(m.group(2)), int(m.group(3))


def aggregate_usage_stats(db: Session, user: UserDB) -> dict:
    start = get_billing_period_start(user)
    end = get_billing_period_end(user)
    now = utc_now()

    q = db.query(TransactionDB).filter(
        TransactionDB.user_id == user.id,
        TransactionDB.tx_type == "AI_SPEND",
    )
    if start:
        q = q.filter(TransactionDB.created_at >= start)

    txs = q.all()
    rate = get_usd_rub_rate_sync()

    prompt_total = 0
    completion_total = 0
    request_count = 0
    spent_usd = 0.0
    by_model: dict[str, dict] = defaultdict(
        lambda: {"model": "", "prompt_tokens": 0, "completion_tokens": 0, "requests": 0}
    )

    for tx in txs:
        parsed = _parse_transaction(tx)
        if parsed:
            model, prompt, completion = parsed
            request_count += 1
            prompt_total += prompt
            completion_total += completion
            row = by_model[model]
            row["model"] = model
            row["prompt_tokens"] += prompt
            row["completion_tokens"] += completion
            row["requests"] += 1
        spent_usd += abs(float(tx.amount or 0))

    spent_usd = round(spent_usd, 6)
    spent_rub = round(usd_to_rub(spent_usd, rate), 2)

    models_list = sorted(
        by_model.values(),
        key=lambda x: x["prompt_tokens"] + x["completion_tokens"],
        reverse=True,
    )[:10]

    return {
        "period_start": start.isoformat() + "Z" if start else None,
        "period_end": end.isoformat() + "Z" if end else None,
        "as_of": now.isoformat() + "Z",
        "prompt_tokens": prompt_total,
        "completion_tokens": completion_total,
        "total_tokens": prompt_total + completion_total,
        "request_count": request_count,
        "spent_usd": spent_usd,
        "spent_rub": spent_rub,
        "usd_rub_rate": rate,
        "by_model": models_list,
    }
