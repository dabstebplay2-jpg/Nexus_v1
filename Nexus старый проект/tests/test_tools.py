import sys

from nexus.activity.events import ActivityType
from nexus.activity.stream import ActivityStream
from nexus.tools.commands import RunCommandTool
from nexus.tools.filesystem import (
    EditFileTool,
    ListFilesTool,
    ReadFileTool,
    SearchCodeTool,
    WriteFileTool,
)
from nexus.tools.registry import ToolRegistry


def test_workspace_file_tools_cover_agent_edit_cycle(tmp_path):
    writer = WriteFileTool(tmp_path)
    reader = ReadFileTool(tmp_path)
    editor = EditFileTool(tmp_path)
    search = SearchCodeTool(tmp_path)
    listing = ListFilesTool(tmp_path)

    writer.execute("src/app.py", "print('old')\n")
    changed = editor.execute("src/app.py", "old", "Nexus")

    assert changed["ok"] is True
    assert reader.execute("src/app.py")["content"] == "print('Nexus')\n"
    assert search.execute("Nexus")["results"][0]["path"] == "src\\app.py"
    assert listing.execute()["files"] == ["src\\app.py"]


def test_tool_registry_emits_activity_and_command_runs(tmp_path):
    stream = ActivityStream()
    registry = ToolRegistry(activity=stream)
    registry.register("write_file", WriteFileTool(tmp_path))
    registry.register("run_command", RunCommandTool(tmp_path))

    registry.execute("write_file", path="hello.txt", content="hello")
    result = registry.execute(
        "run_command",
        command=f'"{sys.executable}" -c "print(123)"',
    )

    assert result["ok"] is True
    assert "123" in result["stdout"]
    assert [event.type for event in stream.history()] == [
        ActivityType.FILE_WRITE.value,
        ActivityType.COMMAND_RUN.value,
    ]
