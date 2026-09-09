"""Project intelligence for Nexus OS V2."""

from nexus.project.analyzer import ProjectAnalyzer
from nexus.project.context import ProjectContext
from nexus.project.indexer import ProjectIndexer
from nexus.project.scanner import ProjectScanner


def find_file(name: str, root: str = ".") -> list[str]:
    return ProjectAnalyzer(root).find_file(name)


def search_code(query: str, root: str = ".", **kwargs) -> list[dict]:
    return ProjectAnalyzer(root).search_code(query, **kwargs)


def find_component(name: str, root: str = ".") -> list[str]:
    return ProjectAnalyzer(root).find_component(name)


def get_dependencies(root: str = ".") -> list[str]:
    return ProjectAnalyzer(root).get_dependencies()


__all__ = [
    "ProjectAnalyzer",
    "ProjectContext",
    "ProjectIndexer",
    "ProjectScanner",
    "find_component",
    "find_file",
    "get_dependencies",
    "search_code",
]
