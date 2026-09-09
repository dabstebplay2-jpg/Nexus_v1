"""One-way migration from the legacy JSON registry to models.yaml."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
from typing import Callable

from nexus.models.config import DEFAULT_PATH, save_models_config
from nexus.models.types import ModelEntry


MIGRATION_SUCCESS_MESSAGE = "Legacy model config migrated successfully."


@dataclass(frozen=True)
class MigrationResult:
    migrated: bool
    legacy_detected: bool
    config_path: Path
    legacy_path: Path
    backup_path: Path | None = None
    message: str | None = None


def find_legacy_config(config_path: str | Path = DEFAULT_PATH) -> Path:
    """Return the legacy JSON location associated with a canonical config."""
    canonical = Path(config_path)
    return canonical.parent / ".nexus" / "models.json"


def migrate_legacy_config(
    config_path: str | Path = DEFAULT_PATH,
    legacy_path: str | Path | None = None,
    backup_dir: str | Path | None = None,
    reporter: Callable[[str], None] | None = print,
) -> MigrationResult:
    """Create models.yaml from legacy JSON without overwriting an existing YAML file."""
    canonical = Path(config_path)
    legacy = Path(legacy_path) if legacy_path is not None else find_legacy_config(canonical)

    if not legacy.exists():
        return MigrationResult(False, False, canonical, legacy)
    if canonical.exists():
        return MigrationResult(
            False,
            True,
            canonical,
            legacy,
            message="Legacy config detected; canonical models.yaml already exists.",
        )

    try:
        raw_text = legacy.read_text(encoding="utf-8")
        data = json.loads(raw_text)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot migrate legacy model config {legacy}: {exc}") from exc

    if isinstance(data, dict):
        current = data.get("current")
        raw_entries = data.get("models", [])
    elif isinstance(data, list):
        current = None
        raw_entries = data
    else:
        raise ValueError(f"Unsupported legacy model config structure in {legacy}")
    if not isinstance(raw_entries, list):
        raise ValueError(f"Legacy 'models' value must be a list in {legacy}")

    entries = [ModelEntry.from_dict(item) for item in raw_entries]
    if current is None and entries:
        current = entries[0].id

    backups = Path(backup_dir) if backup_dir is not None else legacy.parent / "backups"
    backups.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup_path = backups / f"models_backup_{timestamp}.json"
    backup_path.write_text(raw_text, encoding="utf-8")

    save_models_config(entries, current=str(current) if current is not None else None, path=canonical)
    if reporter is not None:
        reporter(MIGRATION_SUCCESS_MESSAGE)
    return MigrationResult(
        True,
        True,
        canonical,
        legacy,
        backup_path=backup_path,
        message=MIGRATION_SUCCESS_MESSAGE,
    )
