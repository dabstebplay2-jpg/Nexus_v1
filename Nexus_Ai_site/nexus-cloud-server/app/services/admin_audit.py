"""Кольцевой буфер логов и действий админки (только для local admin UI)."""

from __future__ import annotations

import logging
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Any

_LOCK = threading.Lock()
_LOG_LINES: deque[dict[str, Any]] = deque(maxlen=2500)
_ADMIN_ACTIONS: deque[dict[str, Any]] = deque(maxlen=500)


class AdminLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "at": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": self.format(record),
            }
            with _LOCK:
                _LOG_LINES.append(entry)
        except Exception:
            pass


def install_admin_log_handler() -> None:
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, AdminLogHandler):
            return
    handler = AdminLogHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)
    for name in (
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "app",
        "app.subscription",
        "app.routerai",
        "app.redis",
        "app.admin",
    ):
        logging.getLogger(name).setLevel(logging.INFO)


def log_admin_action(action: str, detail: str = "", **meta: Any) -> None:
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "detail": detail,
        **meta,
    }
    with _LOCK:
        _ADMIN_ACTIONS.append(entry)
    lines = [f"[ADMIN: {action}]"]
    if detail:
        lines.append(f"  detail: {detail}")
    for k, v in meta.items():
        lines.append(f"  {k}: {v}")
    logging.getLogger("app.admin").info("\n".join(lines))


def get_server_logs(
    *,
    limit: int = 200,
    level: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 1000))
    level = (level or "").upper().strip()
    q = (q or "").strip().lower()
    with _LOCK:
        rows = list(_LOG_LINES)
    if level:
        rows = [r for r in rows if r.get("level") == level]
    if q:
        rows = [
            r
            for r in rows
            if q in (r.get("message") or "").lower() or q in (r.get("logger") or "").lower()
        ]
    return rows[-limit:]


def get_admin_actions(*, limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    with _LOCK:
        return list(_ADMIN_ACTIONS)[-limit:]
