"""Capability-based model selection, separate from model management."""

from __future__ import annotations

from nexus.models.manager import ModelManager
from nexus.models.types import ModelEntry, ModelType


class ModelRouter:
    """Select a configured model for a task without mutating current selection."""

    TASK_KEYWORDS = {
        "coding": {"code", "coding", "program", "python", "код"},
        "reasoning": {"reason", "analysis", "plan", "solve", "рассуж"},
        "fast": {"fast", "quick", "short", "быстр"},
        "chat": {"chat", "talk", "conversation", "чат"},
        "local": {"local", "offline", "private", "локаль"},
    }

    def __init__(self, manager: ModelManager):
        self.manager = manager

    def classify(self, task: str) -> str:
        text = str(task).lower()
        for capability, keywords in self.TASK_KEYWORDS.items():
            if any(keyword in text for keyword in keywords):
                return capability
        return "chat"

    def choose(self, task: str, preferred: str | None = None) -> ModelEntry | None:
        if preferred:
            preferred_entry = self.manager.get(preferred)
            if preferred_entry is not None:
                return preferred_entry

        entries = self.manager.list()
        if not entries:
            return None
        requirement = self.classify(task)

        def score(entry: ModelEntry) -> tuple[int, int, int]:
            capability_score = 1 if requirement in entry.capabilities else 0
            local_score = 1 if requirement == "local" and entry.type == ModelType.LOCAL.value else 0
            fast_score = 1 if requirement == "fast" and entry.context_length <= 8192 else 0
            return local_score, capability_score, fast_score

        ranked = sorted(entries, key=score, reverse=True)
        best = ranked[0]
        if score(best) == (0, 0, 0):
            return self.manager.get_current() or best
        return best

    def choose_for_capabilities(
        self,
        capabilities,
        task: str = "",
        preferred: str | None = None,
    ) -> ModelEntry | None:
        """Choose a role-compatible model, falling back to the current model."""
        requirements = {str(item).lower() for item in capabilities or []}
        if not requirements:
            return self.choose(task, preferred=preferred)

        def supports(entry: ModelEntry) -> bool:
            available = set(entry.capabilities)
            for requirement in requirements:
                if requirement == "long_context":
                    if requirement not in available and entry.context_length < 32768:
                        return False
                elif requirement not in available:
                    return False
            return True

        if preferred:
            preferred_entry = self.manager.get(preferred)
            if preferred_entry is not None and supports(preferred_entry):
                return preferred_entry

        compatible = [entry for entry in self.manager.list() if supports(entry)]
        if compatible:
            return max(
                compatible,
                key=lambda entry: (len(requirements & set(entry.capabilities)), entry.context_length),
            )
        return self.manager.get_current() or self.choose(task)


__all__ = ["ModelRouter"]
