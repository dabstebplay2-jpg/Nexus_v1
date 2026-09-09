"""Подробные многострочные логи для админки (Логи сервера)."""

from __future__ import annotations

import json
import logging
from typing import Any

# Имена logger → попадают в AdminLogHandler (см. admin_audit.install_admin_log_handler)


def get_logger(name: str) -> logging.Logger:
    """app.routerai / app.subscription / app.admin — единый префикс app.*"""
    if name.startswith("app."):
        return logging.getLogger(name)
    return logging.getLogger(f"app.{name}")


def _safe_json(obj: Any, max_len: int = 800) -> str:
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        s = repr(obj)
    if len(s) > max_len:
        return s[:max_len] + "…"
    return s


def mask_sk(value: str | None) -> str:
    v = (value or "").strip()
    if not v:
        return "(пусто)"
    if not v.startswith("sk-"):
        return v[:24] + ("…" if len(v) > 24 else "")
    if len(v) <= 14:
        return "sk-…"
    return f"{v[:10]}…{v[-4:]}"


def mask_hash(value: str | None) -> str:
    v = (value or "").strip()
    if not v:
        return "(пусто)"
    if len(v) <= 20:
        return v
    return f"{v[:14]}…{v[-6:]}"


def log_detail(logger: logging.Logger, tag: str, level: int = logging.INFO, **fields: Any) -> None:
    """
    Один блок в логах админки:
    [TAG]
      поле: значение
    """
    lines = [f"[{tag}]"]
    for key, val in fields.items():
        if val is None:
            continue
        if isinstance(val, (dict, list)):
            lines.append(f"  {key}: {_safe_json(val)}")
        else:
            text = str(val).replace("\n", " ")
            lines.append(f"  {key}: {text}")
    logger.log(level, "\n".join(lines))


def log_routerai_key_record(logger: logging.Logger, tag: str, item: dict[str, Any]) -> None:
    log_detail(
        logger,
        tag,
        name=item.get("name"),
        hash=mask_hash(str(item.get("hash") or "")),
        disabled=item.get("disabled"),
        limit=item.get("limit"),
        limit_remaining=item.get("limit_remaining"),
        usage=item.get("usage"),
        created_at=item.get("created_at"),
    )
