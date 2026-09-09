from __future__ import annotations

from pathlib import Path
import re


class _WorkspaceFileTool:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or Path.cwd()).resolve()

    def resolve_path(self, path: str | Path) -> Path:
        candidate = Path(path)
        target = candidate.resolve() if candidate.is_absolute() else (self.root / candidate).resolve()
        try:
            target.relative_to(self.root)
        except ValueError as exc:
            raise PermissionError(f"Path is outside the Nexus workspace: {path}") from exc
        return target


class ReadFileTool(_WorkspaceFileTool):
    name = "read_file"

    def execute(self, path: str, encoding: str = "utf-8") -> dict:
        target = self.resolve_path(path)
        return {
            "path": str(target.relative_to(self.root)),
            "content": target.read_text(encoding=encoding),
        }


class WriteFileTool(_WorkspaceFileTool):
    name = "write_file"

    def execute(self, path: str, content: str, encoding: str = "utf-8") -> dict:
        target = self.resolve_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(content), encoding=encoding)
        return {
            "path": str(target.relative_to(self.root)),
            "bytes": target.stat().st_size,
        }


class ListFilesTool(_WorkspaceFileTool):
    name = "list_files"

    def execute(
        self,
        path: str = ".",
        recursive: bool = True,
        pattern: str | None = None,
        max_results: int = 1000,
    ) -> dict:
        target = self.resolve_path(path)
        iterator = target.rglob(pattern or "*") if recursive else target.glob(pattern or "*")
        files = [
            str(item.relative_to(self.root))
            for item in iterator
            if item.is_file()
        ][:max_results]
        return {"path": str(target.relative_to(self.root)), "files": files, "count": len(files)}


class EditFileTool(_WorkspaceFileTool):
    name = "edit_file"

    def execute(
        self,
        path: str,
        old: str,
        new: str,
        count: int = -1,
        encoding: str = "utf-8",
    ) -> dict:
        target = self.resolve_path(path)
        content = target.read_text(encoding=encoding)
        occurrences = content.count(str(old))
        if occurrences == 0:
            return {"ok": False, "path": str(target.relative_to(self.root)), "error": "Text not found"}
        updated = content.replace(str(old), str(new), count)
        target.write_text(updated, encoding=encoding)
        replaced = occurrences if count < 0 else min(occurrences, count)
        return {
            "ok": True,
            "path": str(target.relative_to(self.root)),
            "replacements": replaced,
            "bytes": target.stat().st_size,
        }


class SearchCodeTool(_WorkspaceFileTool):
    name = "search_code"

    def execute(
        self,
        query: str,
        path: str = ".",
        regex: bool = False,
        max_results: int = 100,
    ) -> dict:
        target = self.resolve_path(path)
        expression = re.compile(query if regex else re.escape(query), re.IGNORECASE)
        results: list[dict] = []
        for file_path in target.rglob("*"):
            if not file_path.is_file() or any(
                part in {".git", ".venv", "node_modules", "__pycache__"}
                for part in file_path.relative_to(self.root).parts
            ):
                continue
            try:
                lines = file_path.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeError):
                continue
            for line_number, line in enumerate(lines, 1):
                if expression.search(line):
                    results.append(
                        {
                            "path": str(file_path.relative_to(self.root)),
                            "line": line_number,
                            "text": line.strip(),
                        }
                    )
                    if len(results) >= max_results:
                        return {"query": query, "results": results, "count": len(results)}
        return {"query": query, "results": results, "count": len(results)}

class FilesystemTool:
    name="filesystem"

    def list_files(self,path="."):
        return [str(x) for x in Path(path).iterdir()]
