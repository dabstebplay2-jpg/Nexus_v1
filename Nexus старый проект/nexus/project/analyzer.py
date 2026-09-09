"""High-level project analysis facade."""

from __future__ import annotations

from pathlib import Path

from nexus.project.context import ProjectContext
from nexus.project.indexer import ProjectIndexer
from nexus.project.scanner import ProjectScanner


class ProjectAnalyzer:
    def __init__(self, root: str | Path = "."):
        self.root = Path(root).resolve()
        self.scanner = ProjectScanner(self.root)
        self.indexer = ProjectIndexer(self.root, self.scanner)
        self.context: ProjectContext | None = None

    def analyze(self) -> ProjectContext:
        self.context = self.scanner.scan()
        self.indexer.build()
        return self.context

    def find_file(self, name: str) -> list[str]:
        return self.indexer.find_file(name)

    def search_code(self, query: str, **kwargs) -> list[dict]:
        return self.indexer.search_code(query, **kwargs)

    def find_component(self, name: str) -> list[str]:
        return self.indexer.find_component(name)

    def get_dependencies(self) -> list[str]:
        context = self.context or self.analyze()
        return list(context.dependencies)


__all__ = ["ProjectAnalyzer"]
