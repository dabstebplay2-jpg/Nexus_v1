"""Docker/npm-style Nexus health diagnostics."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class DoctorReport:
    checks: dict[str, bool]
    warnings: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)

    @property
    def healthy(self) -> bool:
        return all(self.checks.values())

    def to_dict(self) -> dict:
        return {
            "checks": dict(self.checks),
            "warnings": list(self.warnings),
            "details": dict(self.details),
            "healthy": self.healthy,
        }


class NexusDoctor:
    REQUIRED_TOOLS = {
        "list_files", "read_file", "write_file", "edit_file", "search_code",
        "run_command", "run_tests", "run_build", "git_status", "git_diff",
    }

    def __init__(self, runtime):
        self.runtime = runtime

    def run(self) -> DoctorReport:
        model_doctor = self.runtime.models.doctor()
        tool_names = set(self.runtime.tools.list())
        accounts = self.runtime.models.list_provider_accounts()
        warnings = list(model_doctor.get("warnings", []))
        for account in accounts:
            if account.status in {"offline", "error"}:
                warnings.append(f"{account.name} {account.status}")
        for model_id, error in model_doctor.get("provider_errors", {}).items():
            warnings.append(f"{model_id}: {error}")
        checks = {
            "Runtime": self.runtime._booted,
            "Models": model_doctor["checks"].get("registry", False),
            "Providers": bool(accounts) and model_doctor["checks"].get("providers", False),
            "Tools": self.REQUIRED_TOOLS.issubset(tool_names),
            "Memory": bool(self.runtime.memory.online),
            "Orchestra": self.runtime.orchestra is not None,
        }
        return DoctorReport(
            checks=checks,
            warnings=warnings,
            details={
                "models": len(self.runtime.models.list()),
                "providers": len(accounts),
                "tools": len(tool_names),
                "activity_events": self.runtime.activity.count(),
            },
        )


__all__ = ["DoctorReport", "NexusDoctor"]
