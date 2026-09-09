from __future__ import annotations

from nexus.security.audit import AuditLog
from nexus.security.permissions import PermissionManager


class SecurityGate:
    """Unified security entry point for tool and agent actions."""

    def __init__(self):
        self.permissions = PermissionManager()
        self.audit = AuditLog()

    def check(self, action: str) -> dict:
        allowed = self.permissions.check(action)
        requires_approval = not allowed
        risk = "CRITICAL" if requires_approval else "SAFE"
        return {
            "allowed": allowed,
            "requires_approval": requires_approval,
            "risk": risk,
            "action": action,
        }

    def record(self, event: dict) -> None:
        self.audit.add(event)

    def history(self) -> list:
        return self.audit.list()
