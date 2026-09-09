"""Workspace-bound command, test, build, and dependency tools."""

from __future__ import annotations

from pathlib import Path
import subprocess


class RunCommandTool:
    name = "run_command"

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or Path.cwd()).resolve()

    def execute(self, command: str, timeout: int = 120) -> dict:
        completed = subprocess.run(
            str(command),
            cwd=self.root,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": completed.returncode == 0,
            "command": str(command),
            "exit_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }


class RunTestsTool(RunCommandTool):
    name = "run_tests"

    def execute(self, command: str = "python -m pytest -q", timeout: int = 300) -> dict:
        return super().execute(command, timeout=timeout)


class RunBuildTool(RunCommandTool):
    name = "run_build"

    def execute(self, command: str | None = None, timeout: int = 300) -> dict:
        if command is None:
            if (self.root / "package.json").exists():
                command = "npm run build"
            elif (self.root / "Cargo.toml").exists():
                command = "cargo build"
            elif (self.root / "pyproject.toml").exists():
                command = "python -m compileall -q ."
            else:
                return {"ok": False, "error": "Build system not detected"}
        return super().execute(command, timeout=timeout)


class InstallDependenciesTool(RunCommandTool):
    name = "install_dependencies"

    def execute(self, command: str | None = None, timeout: int = 600) -> dict:
        if command is None:
            if (self.root / "package-lock.json").exists():
                command = "npm ci"
            elif (self.root / "package.json").exists():
                command = "npm install"
            elif (self.root / "requirements.txt").exists():
                command = "python -m pip install -r requirements.txt"
            else:
                return {"ok": False, "error": "Dependency manifest not detected"}
        return super().execute(command, timeout=timeout)


__all__ = ["InstallDependenciesTool", "RunBuildTool", "RunCommandTool", "RunTestsTool"]
