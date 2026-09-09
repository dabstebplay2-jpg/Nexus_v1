"""Portable design tokens for UI-oriented agents."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(slots=True)
class DesignTokens:
    colors: dict[str, str] = field(
        default_factory=lambda: {
            "primary": "#2563EB",
            "surface": "#FFFFFF",
            "background": "#F8FAFC",
            "text": "#0F172A",
            "muted": "#64748B",
            "success": "#16A34A",
            "danger": "#DC2626",
        }
    )
    spacing: dict[str, int] = field(
        default_factory=lambda: {"xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32}
    )
    radius: dict[str, int] = field(
        default_factory=lambda: {"sm": 6, "md": 10, "lg": 16, "pill": 999}
    )
    typography: dict[str, str] = field(
        default_factory=lambda: {"font": "Inter, system-ui, sans-serif", "mono": "JetBrains Mono, monospace"}
    )

    def to_dict(self) -> dict:
        return asdict(self)


__all__ = ["DesignTokens"]
