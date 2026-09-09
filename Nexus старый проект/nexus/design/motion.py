"""Motion defaults for product interfaces."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(slots=True)
class MotionSystem:
    fast_ms: int = 120
    normal_ms: int = 220
    slow_ms: int = 360
    easing: str = "cubic-bezier(0.2, 0.8, 0.2, 1)"
    reduced_motion: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


__all__ = ["MotionSystem"]
