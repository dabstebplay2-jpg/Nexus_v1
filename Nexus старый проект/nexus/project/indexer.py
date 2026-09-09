"""Searchable project file index."""

from __future__ import annotations

import re
from pathlib import Path

from nexus.project.scanner import ProjectScanner


class ProjectIndexer:
    def __init__(self, root: str | Path = ".", scanner: ProjectScanner | None = None):
        self.root = Path(root).resolve()
        self.scanner = scanner or ProjectScanner(self.root)
        self._files: list[Path] = []

    def build(self) -> ProjectIndexer:
        self._files = self.scanner.files()
        return self

    @property
    def files(self) -> list[Path]:
        return self._files or self.build()._files

    def find_file(self, name: str) -> list[str]:
        needle = str(name).lower()
        return [
            str(path.relative_to(self.root))
            for path in self.files
            if needle in path.name.lower() or needle in str(path.relative_to(self.root)).lower()
        ]

    def search_code(
        self,
        query: str,
        *,
        regex: bool = False,
        max_results: int = 100,
    ) -> list[dict]:
        pattern = re.compile(query if regex else re.escape(query), re.IGNORECASE)
        results: list[dict] = []
        for path in self.files:
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeError):
                continue
            for line_number, line in enumerate(lines, 1):
                if pattern.search(line):
                    results.append(
                        {
                            "path": str(path.relative_to(self.root)),
                            "line": line_number,
                            "text": line.strip(),
                        }
                    )
                    if len(results) >= max_results:
                        return results
        return results

    def find_component(self, name: str) -> list[str]:
        candidates = self.find_file(name)
        declaration = rf"(?:function|class|const)\s+{re.escape(name)}\b"
        matches = {item["path"] for item in self.search_code(declaration, regex=True)}
        return sorted(set(candidates) | matches)


__all__ = ["ProjectIndexer"]
