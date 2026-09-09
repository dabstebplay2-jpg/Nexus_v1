"""Read-only git inspection tools."""

from __future__ import annotations

from pathlib import Path
import subprocess


class _GitTool:
    command: tuple[str, ...] = ()

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or Path.cwd()).resolve()

    def execute(self, *extra: str) -> dict:
        completed = subprocess.run(
            ["git", *self.command, *[str(item) for item in extra]],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        return {
            "ok": completed.returncode == 0,
            "exit_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }


class GitStatusTool(_GitTool):
    name = "git_status"
    command = ("status", "--short")


class GitDiffTool(_GitTool):
    name = "git_diff"
    command = ("diff", "--")

    def execute(self, path: str | None = None) -> dict:
        return super().execute(*([path] if path else []))


class GitHistoryTool(_GitTool):
    name = "git_history"
    command = ("log", "--oneline")

    def execute(self, limit: int = 20) -> dict:
        return super().execute(f"-{max(1, int(limit))}")


__all__ = ["GitDiffTool", "GitHistoryTool", "GitStatusTool"]
