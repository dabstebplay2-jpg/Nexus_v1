"""Design system context supplied to Designer roles."""

from __future__ import annotations

from dataclasses import dataclass, field

from nexus.design.motion import MotionSystem
from nexus.design.tokens import DesignTokens


@dataclass(slots=True)
class DesignSystem:
    name: str = "Nexus Product UI"
    tokens: DesignTokens = field(default_factory=DesignTokens)
    motion: MotionSystem = field(default_factory=MotionSystem)
    principles: tuple[str, ...] = (
        "accessible",
        "responsive",
        "consistent",
        "content-first",
    )

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "tokens": self.tokens.to_dict(),
            "motion": self.motion.to_dict(),
            "principles": list(self.principles),
        }


__all__ = ["DesignSystem"]
