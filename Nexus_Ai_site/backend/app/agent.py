import asyncio
import datetime
import os

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "Lists the files and folders inside a given directory path relative to the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path to list. Use '.' for the workspace root."}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Reads the entire content of a file in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The relative path of the file to read."}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Writes or overwrites the content of a file in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The relative path of the file to write."},
                    "content": {"type": "string", "description": "The full text content to write into the file."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_file",
            "description": "Replaces a specific block of code in a file. Use this for editing existing files instead of rewriting them completely.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The relative path of the file to edit."},
                    "search_block": {
                        "type": "string",
                        "description": "The exact block of code currently in the file that you want to replace.",
                    },
                    "replace_block": {
                        "type": "string",
                        "description": "The new block of code to insert instead of the search_block.",
                    },
                },
                "required": ["path", "search_block", "replace_block"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_command",
            "description": "Executes a shell command in the workspace directory and returns its output (stdout/stderr).",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The command to run."}
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_file_in_editor",
            "description": "Instructs the IDE frontend to open a file in the main code editor tabs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The relative path of the file to open in the IDE editor."}
                },
                "required": ["path"],
            },
        },
    },
]


def log_agent_action(model: str, action: str, cost: float = None):
    try:
        log_path = os.path.expanduser("~/.nexus_ide_agent.log")
        now = datetime.datetime.now().isoformat()
        cost_str = f" | Cost: ${cost:.6f}" if cost is not None else ""
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{now}] Model: {model} | Action: {action}{cost_str}\n")
    except Exception:
        pass


def resolve_workspace_path(workspace: str, requested_path: str) -> str:
    """Resolve an agent path and reject escapes through ``..`` or symlinks."""
    if not isinstance(workspace, str) or not workspace.strip():
        raise ValueError("Workspace path is required")
    if not isinstance(requested_path, str) or not requested_path.strip():
        raise ValueError("A relative file path is required")

    root = os.path.realpath(os.path.abspath(workspace))
    if not os.path.isdir(root):
        raise ValueError("Workspace directory does not exist")

    candidate = os.path.realpath(os.path.abspath(os.path.join(root, requested_path)))
    try:
        inside_workspace = os.path.commonpath([root, candidate]) == root
    except ValueError:
        inside_workspace = False
    if not inside_workspace:
        raise ValueError("Path must stay inside the workspace")
    return candidate


async def execute_tool(name: str, args: dict, workspace: str):
    req_path = None
    target_path = None
    if name in {"list_directory", "read_file", "write_file", "patch_file", "open_file_in_editor"}:
        req_path = args.get("path", ".") if name == "list_directory" else args.get("path")
        try:
            target_path = resolve_workspace_path(workspace, req_path)
        except ValueError as exc:
            return f"Error: {exc}"

    if name == "list_directory":
        try:
            entries = os.listdir(target_path)
            return "\n".join(
                [
                    f"📁 {e}" if os.path.isdir(os.path.join(target_path, e)) else f"📄 {e}"
                    for e in entries
                ]
            )
        except Exception as e:
            return f"Error listing directory: {e}"

    elif name == "read_file":
        try:
            with open(target_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {e}"

    elif name == "write_file":
        content = args.get("content", "")
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"Success: File successfully written to relative path: {req_path}."
        except Exception as e:
            return f"Error writing file: {e}"

    elif name == "patch_file":
        search_block = args.get("search_block")
        replace_block = args.get("replace_block")
        try:
            if not os.path.exists(target_path):
                return f"Error: File '{req_path}' does not exist. Use write_file to create new files."

            with open(target_path, "r", encoding="utf-8") as f:
                content = f.read()

            content_norm = content.replace("\r\n", "\n")
            search_norm = search_block.replace("\r\n", "\n")
            replace_norm = replace_block.replace("\r\n", "\n")

            if search_norm in content_norm:
                updated_content = content_norm.replace(search_norm, replace_norm)
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(updated_content)
                return f"Success: Successfully patched '{req_path}' by replacing the specified block."
            return (
                f"Error: Could not find the exact 'search_block' in '{req_path}'. "
                "Please make sure you copy the existing code block precisely."
            )
        except Exception as e:
            return f"Error patching file: {e}"

    elif name == "execute_command":
        cmd = args.get("command")
        try:
            workspace_root = resolve_workspace_path(workspace, ".")
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=workspace_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=45.0)
                stdout = stdout_bytes.decode("utf-8", errors="replace")
                stderr = stderr_bytes.decode("utf-8", errors="replace")
                return f"Exit Code: {proc.returncode}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass
                return "Error: Command timed out after 45 seconds and was forcefully terminated."
        except Exception as e:
            return f"Error executing command: {e}"

    elif name == "open_file_in_editor":
        return f"Success: Triggered request to open {req_path} in the editor tab."

    return f"Unknown tool: {name}"
