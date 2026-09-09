from __future__ import annotations

from dataclasses import dataclass, field
from difflib import unified_diff
from pathlib import Path


@dataclass
class FileChange:
    path: str
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    before: str | None = None
    after: str | None = None

    @property
    def has_diff(self) -> bool:
        return bool(self.added or self.removed)


class ChangeEngine:
    """Track file changes and produce human-readable diffs."""

    def __init__(self):
        self._changes: list[FileChange] = []
        self._snapshots: dict[str, str] = {}

    def snapshot(self, path: str | Path, content: str | None = None) -> None:
        path_str = str(path)
        if content is None and Path(path_str).is_file():
            content = Path(path_str).read_text(encoding="utf-8", errors="replace")
        if content is not None:
            self._snapshots[path_str] = content

    def record(self, path: str | Path, after: str) -> FileChange:
        path_str = str(path)
        before = self._snapshots.get(path_str, "")
        before_lines = before.splitlines()
        after_lines = after.splitlines()

        added = [line for line in after_lines if line not in before_lines]
        removed = [line for line in before_lines if line not in after_lines]

        change = FileChange(
            path=path_str,
            added=added,
            removed=removed,
            before=before or None,
            after=after,
        )
        self._changes.append(change)
        self._snapshots[path_str] = after
        return change

    def record_file_edit(self, path: str | Path) -> FileChange | None:
        path_obj = Path(path)
        if not path_obj.is_file():
            return None
        return self.record(path_obj, path_obj.read_text(encoding="utf-8", errors="replace"))

    def diff(self, path: str | Path) -> str:
        path_str = str(path)
        change = next((c for c in reversed(self._changes) if c.path == path_str), None)
        if change is None:
            return ""
        return "\n".join(
            unified_diff(
                (change.before or "").splitlines(),
                (change.after or "").splitlines(),
                fromfile=f"{path_str} (before)",
                tofile=f"{path_str} (after)",
                lineterm="",
            )
        )

    def format_change(self, change: FileChange) -> str:
        lines = [f"FILE:\n{change.path}\n"]
        for line in change.added:
            lines.append(f"+ {line}")
        for line in change.removed:
            lines.append(f"- {line}")
        return "\n".join(lines)

    def list_changes(self) -> list[FileChange]:
        return list(self._changes)

    def summary(self) -> dict:
        return {
            "files_changed": len(self._changes),
            "lines_added": sum(len(c.added) for c in self._changes),
            "lines_removed": sum(len(c.removed) for c in self._changes),
        }

    def clear(self) -> None:
        self._changes.clear()
        self._snapshots.clear()
