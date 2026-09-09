"""Artifacts exchanged between Orchestra workers."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
import uuid


@dataclass(slots=True)
class Artifact:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "result"
    path: str | None = None
    owner: str = "unknown"
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "path": self.path,
            "owner": self.owner,
            "metadata": dict(self.metadata),
        }


class ArtifactStore:
    """In-memory artifact catalog for one Orchestra execution."""

    def __init__(self, artifacts: Iterable[Artifact] | None = None):
        self._artifacts: dict[str, Artifact] = {}
        for artifact in artifacts or []:
            self.add(artifact)

    def add(self, artifact: Artifact) -> Artifact:
        if not isinstance(artifact, Artifact):
            raise TypeError("ArtifactStore accepts only Artifact values")
        self._artifacts[artifact.id] = artifact
        return artifact

    def list(self, artifact_type: str | None = None) -> list[Artifact]:
        artifacts = list(self._artifacts.values())
        if artifact_type is None:
            return artifacts
        return [item for item in artifacts if item.type == artifact_type]

    def for_owner(self, owner: str) -> list[Artifact]:
        return [item for item in self._artifacts.values() if item.owner == owner]

    def from_execution(self, owner: str, result: dict[str, Any]) -> list[Artifact]:
        """Create artifact records for concrete tool outputs and worker output."""
        created: list[Artifact] = []
        for call in result.get("tools", []) if isinstance(result, dict) else []:
            tool_result = call.get("result", {})
            path = tool_result.get("path") if isinstance(tool_result, dict) else None
            if not path:
                continue
            suffix = Path(str(path)).suffix.lstrip(".") or "file"
            artifact = Artifact(
                type=suffix,
                path=str(path),
                owner=owner,
                metadata={"tool": call.get("name"), "result": tool_result},
            )
            created.append(self.add(artifact))

        if not created and isinstance(result, dict) and result.get("answer") is not None:
            created.append(
                self.add(
                    Artifact(
                        type="result",
                        owner=owner,
                        metadata={"answer": result.get("answer")},
                    )
                )
            )
        return created


__all__ = ["Artifact", "ArtifactStore"]
