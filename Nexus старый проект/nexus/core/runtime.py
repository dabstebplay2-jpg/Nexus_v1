from __future__ import annotations

from pathlib import Path

from nexus.activity.api import ActivityAPI
from nexus.activity.events import ActivityType
from nexus.activity.stream import ActivityStream
from nexus.agents.executor import AgentExecutor
from nexus.agents.registry import AgentRegistry
from nexus.core.change_engine import ChangeEngine
from nexus.core.config import NexusConfig
from nexus.core.event_bus import EventBus
from nexus.core.event_types import EventType
from nexus.core.kernel import NexusKernel
from nexus.core.state import SystemState, SystemStatus
from nexus.core.tasks import TaskManager
from nexus.memory.manager import MemoryManager
from nexus.models.manager import ModelManager
from nexus.orchestra.runtime import OrchestraRuntime
from nexus.plugins.manager import PluginManager
from nexus.project.analyzer import ProjectAnalyzer
from nexus.security.security_gate import SecurityGate
from nexus.tools.registry import ToolRegistry
from nexus.tools.shell import ShellTool
from nexus.tools.commands import InstallDependenciesTool, RunBuildTool, RunCommandTool, RunTestsTool
from nexus.tools.filesystem import (
    EditFileTool,
    FilesystemTool,
    ListFilesTool,
    ReadFileTool,
    SearchCodeTool,
    WriteFileTool,
)
from nexus.tools.git import GitDiffTool, GitHistoryTool, GitStatusTool
from nexus.version import CODENAME, VERSION


class NexusRuntime:
    """Central runtime for Nexus 5.0 — lifecycle, subsystems, task execution."""

    def __init__(self, config: NexusConfig | None = None):
        self.config = config or NexusConfig.load()
        self.kernel = NexusKernel()
        self.events = EventBus()
        self.tasks = TaskManager()
        self.memory = MemoryManager()
        self.activity = ActivityStream()
        self.activity_api = ActivityAPI(self.activity)
        self.tools = ToolRegistry(activity=self.activity)
        self.project = ProjectAnalyzer(Path.cwd())
        self.project_context = None
        self.models = ModelManager()
        self.agent_executor = AgentExecutor(self.models, self.memory, self.tools)
        self.agents = AgentRegistry(executor=self.agent_executor)
        self.orchestra = OrchestraRuntime(
            director=self.agents.get_default(),
            executor=self.agent_executor,
        )
        self.plugins = PluginManager()
        self.security = SecurityGate()
        self.changes = ChangeEngine()
        self.agent_activity: dict = {}
        self._booted = False

    async def boot(self) -> None:
        if self._booted:
            return

        await self.events.emit(EventType.RUNTIME_BOOT_START, {"version": VERSION})
        await self.kernel.boot()

        self._register_default_tools()
        self.kernel.register("events", self.events)
        self.kernel.register("agents", self.agents)
        self.kernel.register("memory", self.memory)
        self.kernel.register("tools", self.tools)
        self.kernel.register("models", self.models)
        self.kernel.register("orchestra", self.orchestra)
        self.kernel.register("activity", self.activity)
        self.kernel.register("project", self.project)
        self.kernel.register("plugins", self.plugins)
        self.kernel.register("security", self.security)
        self.kernel.register("changes", self.changes)

        self._booted = True
        await self.events.emit(EventType.RUNTIME_BOOT_COMPLETE, self.status())

    async def shutdown(self) -> None:
        await self.events.emit(EventType.RUNTIME_SHUTDOWN_START)
        await self.kernel.shutdown()
        self._booted = False
        self.agent_activity = {}
        await self.events.emit(EventType.RUNTIME_SHUTDOWN_COMPLETE)

    def _register_default_tools(self) -> None:
        if not self.tools.get("shell"):
            self.tools.register("shell", ShellTool())
        if not self.tools.get("filesystem"):
            self.tools.register("filesystem", FilesystemTool())
        if not self.tools.get("read_file"):
            self.tools.register("read_file", ReadFileTool())
        if not self.tools.get("write_file"):
            self.tools.register("write_file", WriteFileTool())
        defaults = {
            "list_files": ListFilesTool,
            "edit_file": EditFileTool,
            "search_code": SearchCodeTool,
            "run_command": RunCommandTool,
            "run_tests": RunTestsTool,
            "run_build": RunBuildTool,
            "install_dependencies": InstallDependenciesTool,
            "git_status": GitStatusTool,
            "git_diff": GitDiffTool,
            "git_history": GitHistoryTool,
        }
        for name, tool_type in defaults.items():
            if not self.tools.get(name):
                self.tools.register(name, tool_type())

    def _set_agent_activity(self, agent: str, status: str, action: str) -> None:
        self.agent_activity = {"agent": agent, "status": status, "action": action}

    async def run_task(self, prompt: str) -> dict:
        if not self._booted:
            await self.boot()

        activity_start = self.activity.count()
        self.activity.publish(
            ActivityType.PROJECT_ANALYSIS_STARTED,
            agent="Director",
            message="Изучает workspace",
        )
        self.project = ProjectAnalyzer(Path.cwd())
        self.project_context = self.project.analyze()
        project_data = self.project_context.to_dict()
        self.activity.publish(
            ActivityType.PROJECT_ANALYZED,
            agent="Director",
            message=f"{self.project_context.framework} + {self.project_context.language} найден",
            data=project_data,
        )

        task = self.tasks.create(
            {"input": prompt, "prompt": prompt, "project": project_data}
        )
        task.status = "EXECUTING"
        await self.events.emit(EventType.TASK_CREATED, {"task_id": task.id, "prompt": prompt})

        decision = self.security.check(prompt)
        self.security.record({"type": "task.request", "prompt": prompt, "decision": decision})

        agent = self.agents.get_default()

        self._set_agent_activity(agent.name, "SCANNING", f"Analyzing task: {prompt[:60]}")
        await self.events.emit(
            EventType.AGENT_STARTED,
            {"agent": agent.name, "task_id": task.id, "action": self.agent_activity["action"]},
        )

        try:
            self._set_agent_activity(agent.name, "EXECUTING", f"Processing: {prompt[:60]}")
            # Keep the executor replaceable for tests, plugins, and embedding.
            self.orchestra.executor = self.agent_executor
            result = await self.orchestra.execute(
                prompt,
                progress=self.activity.handle_orchestra_event,
                context={"project": project_data},
            )
        except Exception as exc:
            task.status = "FAILED"
            self._set_agent_activity(agent.name, "FAILED", str(exc))
            await self.events.emit(
                EventType.ERROR_OCCURRED,
                {"agent": agent.name, "task_id": task.id, "error": str(exc)},
            )
            await self.events.emit(
                EventType.TASK_FAILED,
                {"task_id": task.id, "error": str(exc)},
            )
            self.activity.publish(
                ActivityType.FAILED,
                agent=agent.name,
                status="failed",
                message=str(exc),
            )
            raise
        finally:
            await self.events.emit(
                EventType.AGENT_FINISHED,
                {"agent": agent.name, "task_id": task.id},
            )

        for tool_call in result.get("tools", []):
            await self.events.emit(
                EventType.TOOL_EXECUTED,
                {
                    "task_id": task.id,
                    "tool": tool_call.get("name"),
                    "result": tool_call.get("result"),
                },
            )

        self.memory.remember("short", {"task_id": task.id, "prompt": prompt, "result": result})
        await self.events.emit(
            EventType.MEMORY_UPDATED,
            {"scope": "short", "task_id": task.id},
        )

        task.status = "COMPLETED"
        self._set_agent_activity(agent.name, "COMPLETED", "Task finished")
        await self.events.emit(EventType.TASK_COMPLETED, {"task_id": task.id, "result": result})

        return {
            "task_id": task.id,
            "prompt": prompt,
            "model": result.get("model"),
            "model_id": result.get("model_id"),
            "context_items": result.get("memory_items", 0),
            "agent": agent.name,
            "pipeline": ["Director", "Planner", "Worker", "AgentExecutor", "Tool", "Verifier"],
            "orchestra": {
                "team": result.get("team", []),
                "verification": result.get("verification"),
                "artifacts": result.get("artifacts", []),
                "repair_rounds": result.get("repair_rounds", 0),
            },
            "project": project_data,
            "activity": [
                event.to_dict()
                for event in self.activity.history(since=activity_start)
            ],
            "status": task.status,
            "result": result,
        }

    def status(self) -> dict:
        system = SystemStatus(
            state=self.kernel.state,
            version=VERSION,
            codename=CODENAME,
            agents_loaded=len(self.agents.list()),
            tools_loaded=len(self.tools.list()),
            plugins_loaded=self.plugins.count(),
            memory_online=self.memory.online,
            kernel_online=self.kernel.state == SystemState.ONLINE,
        )
        return {
            "version": system.version,
            "codename": system.codename,
            "state": system.state.value,
            "kernel": "ONLINE" if system.kernel_online else "OFFLINE",
            "agents": system.agents_loaded,
            "tools": system.tools_loaded,
            "plugins": system.plugins_loaded,
            "memory": "ONLINE" if system.memory_online else "OFFLINE",
            "models": self.models.summary(),
            "current_model": self.models.get_current().name if self.models.get_current() else None,
            "changes": self.changes.summary(),
            "agent_activity": dict(self.agent_activity),
            "events": self.events.count(),
            "activity_events": self.activity.count(),
            "project": self.project_context.to_dict() if self.project_context else None,
            "config": {
                "runtime_mode": self.config.runtime_mode,
                "agents_enabled": self.config.agents_enabled,
                "memory_enabled": self.config.memory_enabled,
                "sandbox_enabled": self.config.sandbox_enabled,
            },
        }


_runtime: NexusRuntime | None = None


def get_runtime() -> NexusRuntime:
    global _runtime
    if _runtime is None:
        _runtime = NexusRuntime()
    return _runtime
