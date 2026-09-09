from __future__ import annotations

import re

from nexus.memory.project_memory import ProjectMemory
from nexus.memory.store import MemoryStore


class MemoryManager:
    """Unified memory facade: short-term context, long-term notes, project memory."""

    def __init__(self):
        self.short_term = MemoryStore()
        self.long_term = MemoryStore()
        self.project = ProjectMemory()
        self._online = True

    def remember(self, scope: str, item: dict) -> None:
        if scope == "project":
            project = item.get("project", "default")
            self.project.save(project, item)
            return
        if scope == "long":
            self.long_term.save(item)
            return
        self.short_term.save(item)

    def get_context(self, scope: str = "short", project: str | None = None) -> list:
        if scope == "project" and project:
            data = self.project.load(project)
            return [data] if data else []
        if scope == "long":
            return self.long_term.retrieve()
        return self.short_term.retrieve()

    def search(self, query: str, limit: int = 5) -> list:
        """Return the most relevant stored items using lightweight token matching."""
        terms = {
            token
            for token in re.findall(r"\w+", str(query).lower(), flags=re.UNICODE)
            if len(token) > 2
        }
        if not terms or limit <= 0:
            return []

        items = [
            *self.short_term.retrieve(),
            *self.long_term.retrieve(),
            *self.project.projects.values(),
        ]
        ranked: list[tuple[int, int, object]] = []
        for index, item in enumerate(items):
            text = str(item).lower()
            score = sum(1 for term in terms if term in text)
            if score:
                ranked.append((score, index, item))

        ranked.sort(key=lambda value: (value[0], value[1]), reverse=True)
        return [item for _, _, item in ranked[:limit]]

    def stats(self) -> dict:
        return {
            "online": self._online,
            "short_term_items": len(self.short_term.items),
            "long_term_items": len(self.long_term.items),
            "projects": len(self.project.projects),
        }

    @property
    def online(self) -> bool:
        return self._online
