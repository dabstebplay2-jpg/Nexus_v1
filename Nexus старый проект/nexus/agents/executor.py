"""Model-backed execution loop for Nexus Agent Runtime V1."""

from __future__ import annotations

import json
import re
from typing import Any

from nexus.memory.manager import MemoryManager
from nexus.models.manager import ModelManager
from nexus.models.model_router import ModelRouter
from nexus.tools.registry import ToolRegistry


class AgentExecutor:
    """Execute one task through a model, memory and an allowlisted tool loop."""

    ALLOWED_TOOLS = frozenset(
        {
            "list_files", "read_file", "write_file", "edit_file", "search_code",
            "run_command", "run_tests", "run_build", "install_dependencies",
            "git_status", "git_diff", "git_history",
        }
    )
    FILE_TASK_KEYWORDS = frozenset(
        {
            "file",
            "read",
            "write",
            "create",
            "edit",
            "файл",
            "прочитай",
            "запиши",
            "создай",
            "измени",
        }
    )
    WRITE_TASK_KEYWORDS = frozenset({"write", "create", "edit", "запиши", "создай", "измени"})
    READ_TASK_KEYWORDS = frozenset({"read", "прочитай"})

    def __init__(
        self,
        models: ModelManager,
        memory: MemoryManager,
        tools: ToolRegistry,
        router: ModelRouter | None = None,
        max_tool_calls: int = 4,
    ):
        self.models = models
        self.memory = memory
        self.tools = tools
        self.router = router or ModelRouter(models)
        self.max_tool_calls = max_tool_calls

    @staticmethod
    def _task_text(task) -> str:
        if isinstance(task, str):
            return task
        context = getattr(task, "context", None)
        if isinstance(context, dict):
            value = context.get("prompt") or context.get("input")
            if value is not None:
                return str(value)
        return str(task)

    @classmethod
    def _requires_file_tools(cls, task: str) -> bool:
        text = task.lower()
        words = set(re.findall(r"\w+", text, flags=re.UNICODE))
        has_path = re.search(r"(?:^|\s)[\w./\\-]+\.[a-z0-9]{1,10}(?:\s|$)", text) is not None
        return bool(words & cls.FILE_TASK_KEYWORDS) or has_path

    @classmethod
    def _required_tool(cls, task: str) -> str | None:
        words = set(re.findall(r"\w+", task.lower(), flags=re.UNICODE))
        if words & cls.WRITE_TASK_KEYWORDS:
            return "write_file"
        if words & cls.READ_TASK_KEYWORDS:
            return "read_file"
        return None

    @staticmethod
    def _path_from_task(task: str) -> str | None:
        match = re.search(
            r"(?<!\w)([\w./\\-]+\.[a-z0-9]{1,10})(?!\w)",
            task,
            flags=re.IGNORECASE | re.UNICODE,
        )
        return match.group(1) if match else None

    @classmethod
    def _implicit_tool_request(
        cls,
        task: str,
        response: str,
        required_tool: str | None,
    ) -> tuple[str, dict] | None:
        """Normalize a small-model artifact response into an allowlisted call."""
        target_path = cls._path_from_task(task)
        if not target_path or not required_tool:
            return None
        if required_tool == "read_file":
            return "read_file", {"path": target_path}
        if required_tool != "write_file":
            return None

        code_block = re.search(
            r"```(?:[\w.+-]+)?[ \t]*\r?\n(.*?)```",
            str(response),
            flags=re.DOTALL,
        )
        if code_block is None:
            return None
        content = code_block.group(1)
        return "write_file", {"path": target_path, "content": content}

    @classmethod
    def _prompt(
        cls,
        task: str,
        tools_enabled: bool,
        *,
        role: str | None = None,
        context: dict | None = None,
        artifacts: list | None = None,
        allowed_tools: set[str] | None = None,
    ) -> str:
        prompt = "You are the Nexus execution agent. Complete the user's task.\n"
        if role:
            prompt += f"Your assigned role is {role}. Act within that responsibility.\n"
        if context:
            prompt += "Upstream worker context:\n" + json.dumps(
                context, ensure_ascii=False, default=str
            ) + "\n"
        if artifacts:
            serialized = [
                item.to_dict() if hasattr(item, "to_dict") else item
                for item in artifacts
            ]
            prompt += "Available artifacts:\n" + json.dumps(
                serialized, ensure_ascii=False, default=str
            ) + "\n"
        if not tools_enabled:
            return prompt + "Answer directly without calling a tool.\n\n" + f"Task:\n{task}"
        tool_names = allowed_tools or set(cls.ALLOWED_TOOLS)
        tool_lines = []
        if "read_file" in tool_names:
            tool_lines.append(
                '- read_file: {"tool":"read_file","arguments":{"path":"relative/path"}}\n'
            )
        if "write_file" in tool_names:
            tool_lines.append(
                '- write_file: {"tool":"write_file","arguments":{"path":"relative/path",'
                '"content":"file contents"}}\n'
            )
        schemas = {
            "list_files": '- list_files: {"tool":"list_files","arguments":{"path":".","recursive":true}}\n',
            "edit_file": '- edit_file: {"tool":"edit_file","arguments":{"path":"file","old":"text","new":"text"}}\n',
            "search_code": '- search_code: {"tool":"search_code","arguments":{"query":"symbol","path":"."}}\n',
            "run_command": '- run_command: {"tool":"run_command","arguments":{"command":"command"}}\n',
            "run_tests": '- run_tests: {"tool":"run_tests","arguments":{}}\n',
            "run_build": '- run_build: {"tool":"run_build","arguments":{}}\n',
            "install_dependencies": '- install_dependencies: {"tool":"install_dependencies","arguments":{}}\n',
            "git_status": '- git_status: {"tool":"git_status","arguments":{}}\n',
            "git_diff": '- git_diff: {"tool":"git_diff","arguments":{}}\n',
            "git_history": '- git_history: {"tool":"git_history","arguments":{"limit":20}}\n',
        }
        for name, schema in schemas.items():
            if name in tool_names:
                tool_lines.append(schema)
        return (
            prompt
            +
            "Available tools:\n"
            + "".join(tool_lines)
            +
            "When a tool is needed, respond with exactly one JSON object and no prose. "
            "Use a tool only when the task explicitly requires reading or writing a file; "
            "for questions and simple messages, answer directly without a tool. "
            "After receiving a tool result, either request another tool or return the final answer. "
            "Always use the exact workspace-relative file path named in the Task; "
            "paths in the tool examples are placeholders. "
            "Never claim a file operation succeeded unless its tool result confirms it.\n\n"
            f"Task:\n{task}"
        )

    @staticmethod
    def _json_objects(text: str):
        decoder = json.JSONDecoder()
        for index, character in enumerate(text):
            if character != "{":
                continue
            try:
                payload, _ = decoder.raw_decode(text[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                yield payload

    @classmethod
    def _tool_request(cls, response: str) -> tuple[str, dict] | None:
        for payload in cls._json_objects(str(response)):
            request = payload.get("tool_call") if isinstance(payload.get("tool_call"), dict) else payload
            name = request.get("tool") or request.get("name")
            if not name:
                continue
            arguments = request.get("arguments", request.get("args", {}))
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Invalid arguments for tool {name}") from exc
            if not isinstance(arguments, dict):
                raise ValueError(f"Arguments for tool {name} must be an object")
            return str(name), arguments
        return None

    async def execute(
        self,
        *args,
        task=None,
        model_id: str | None = None,
        agent_name: str = "Director",
        role: str | None = None,
        objective: str | None = None,
        context: dict | None = None,
        artifacts: list | None = None,
        allowed_tools=None,
    ) -> dict:
        """Execute legacy tasks or the Orchestra role/objective contract.

        Legacy calls such as ``execute(task, model_id, agent_name)`` remain valid.
        Orchestra may use keywords or ``execute(role, objective, context, artifacts)``.
        """
        if len(args) == 4:
            if any(value is not None for value in (task, role, objective, context, artifacts)):
                raise TypeError("Conflicting positional and keyword execution arguments")
            role, objective, context, artifacts = args
        elif len(args) <= 3:
            legacy = [task, model_id, agent_name]
            for index, value in enumerate(args):
                if index == 0 and task is not None:
                    raise TypeError("Task was provided more than once")
                legacy[index] = value
            task, model_id, agent_name = legacy
        else:
            raise TypeError("execute() accepts at most four positional arguments")

        task_source = objective if objective is not None else task
        if task_source is None:
            raise TypeError("execute() requires a task or objective")
        if role and agent_name == "Director":
            agent_name = str(role).title()
        task_text = self._task_text(task_source)
        memory_context = self.memory.search(task_text)
        preferred = model_id or self.models.current_id()
        selected = self.router.choose(task_text, preferred=preferred)
        if selected is None:
            raise RuntimeError("No model available for agent execution")

        allowed = (
            set(self.ALLOWED_TOOLS)
            if allowed_tools is None
            else set(allowed_tools) & set(self.ALLOWED_TOOLS)
        )
        tools_enabled = bool(allowed) and (
            allowed_tools is not None or self._requires_file_tools(task_text)
        )
        required_tool = self._required_tool(task_text)
        if required_tool not in allowed:
            required_tool = None
        conversation = self._prompt(
            task_text,
            tools_enabled,
            role=role,
            context=context,
            artifacts=artifacts,
            allowed_tools=allowed,
        )
        response = await self.models.generate(
            conversation,
            model_id=selected.id,
            context=memory_context,
        )
        tool_calls: list[dict[str, Any]] = []
        correction_requested = False

        def completed(final_response: str) -> dict:
            return {
                "agent": agent_name,
                "role": role,
                "status": "completed",
                "answer": final_response,
                "model": selected.name,
                "model_id": selected.id,
                "memory_items": len(memory_context),
                "tools": tool_calls,
                "trace": [
                    "Agent started",
                    f"Model: {selected.id}",
                    "Generating",
                    *[f"Tool: {item['name']}" for item in tool_calls],
                    "Completed",
                ],
            }

        for call_index in range(self.max_tool_calls + 1):
            request = self._tool_request(response) if tools_enabled else None
            if request is None and not tool_calls:
                request = self._implicit_tool_request(
                    task_text,
                    response,
                    required_tool,
                )
            if request is None:
                if required_tool and not tool_calls and not correction_requested:
                    correction_requested = True
                    conversation = (
                        f"{conversation}\n\n"
                        f"Assistant response rejected:\n{response}\n\n"
                        f"The task requires the {required_tool} tool. Do not return a code block "
                        "or explanation. Respond now with exactly one valid JSON tool request."
                    )
                    response = await self.models.generate(
                        conversation,
                        model_id=selected.id,
                        context=memory_context,
                    )
                    continue
                return completed(response)

            if call_index >= self.max_tool_calls:
                raise RuntimeError("Agent tool-call limit exceeded")

            tool_name, arguments = request
            if tool_name not in allowed:
                raise PermissionError(f"Agent tool is not allowed: {tool_name}")

            target_path = self._path_from_task(task_text)
            if target_path and tool_name == required_tool:
                arguments = dict(arguments)
                arguments["path"] = target_path

            if tool_calls:
                previous = tool_calls[-1]
                previous_result = previous.get("result")
                repeated = previous.get("name") == tool_name and previous.get("arguments") == arguments
                succeeded = not (
                    isinstance(previous_result, dict)
                    and previous_result.get("ok") is False
                )
                if repeated and succeeded:
                    path = arguments.get("path", "the requested target")
                    return completed(f"{tool_name} completed successfully for {path}.")

            try:
                result = self.tools.execute(tool_name, **arguments)
            except Exception as exc:
                result = {
                    "ok": False,
                    "error": str(exc),
                    "exception": type(exc).__name__,
                }
            tool_calls.append(
                {"name": tool_name, "arguments": arguments, "result": result}
            )
            conversation = (
                f"{conversation}\n\n"
                f"Assistant tool request:\n{response}\n\n"
                f"Tool result ({tool_name}):\n"
                f"{json.dumps(result, ensure_ascii=False, default=str)}\n\n"
                "Continue the task. Request another tool as JSON or return the final answer."
            )
            response = await self.models.generate(
                conversation,
                model_id=selected.id,
                context=memory_context,
            )

        raise RuntimeError("Agent execution ended without a final response")


__all__ = ["AgentExecutor"]
