from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ALLOWED_ROLES = frozenset({"system", "user", "assistant"})


@dataclass(frozen=True)
class DatasetRecord:
    """A discovered conversational JSONL dataset."""

    id: str
    name: str
    path: Path
    size_bytes: int
    source: str


@dataclass(frozen=True)
class DatasetValidation:
    """The complete result of validating one JSONL file."""

    path: Path
    valid: bool
    record_count: int
    errors: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "valid": self.valid,
            "record_count": self.record_count,
            "errors": list(self.errors),
        }


def _validate_messages(value: Any, line_number: int) -> list[str]:
    prefix = f"line {line_number}"
    if not isinstance(value, list) or not value:
        return [f"{prefix}: 'messages' must be a non-empty list"]

    errors: list[str] = []
    roles: list[str] = []
    for message_number, message in enumerate(value, 1):
        location = f"{prefix}, message {message_number}"
        if not isinstance(message, dict):
            errors.append(f"{location}: message must be an object")
            continue

        role = message.get("role")
        content = message.get("content")
        if role not in ALLOWED_ROLES:
            allowed = ", ".join(sorted(ALLOWED_ROLES))
            errors.append(f"{location}: role must be one of {allowed}")
        else:
            roles.append(role)
        if not isinstance(content, str) or not content.strip():
            errors.append(f"{location}: content must be a non-empty string")

    if "user" not in roles:
        errors.append(f"{prefix}: conversation must contain a user message")
    if not roles or roles[-1] != "assistant":
        errors.append(f"{prefix}: final message must have role 'assistant'")
    return errors


def validate_jsonl(path: str | Path, *, minimum_records: int = 2) -> DatasetValidation:
    """Validate the strict conversational JSONL format used by the trainer.

    Every non-blank line must be a JSON object with a non-empty ``messages``
    list. Only ``system``, ``user`` and ``assistant`` roles are accepted, every
    content value must be a non-empty string, and each conversation must contain
    a user turn and end with an assistant turn.
    """

    candidate = Path(path).expanduser().resolve()
    errors: list[str] = []
    record_count = 0

    if not candidate.is_file():
        return DatasetValidation(candidate, False, 0, ("file does not exist",))
    if candidate.suffix.casefold() != ".jsonl":
        errors.append("file extension must be .jsonl")

    try:
        with candidate.open("r", encoding="utf-8") as stream:
            for line_number, raw_line in enumerate(stream, 1):
                if not raw_line.strip():
                    errors.append(f"line {line_number}: blank lines are not allowed")
                    continue
                try:
                    item = json.loads(raw_line)
                except json.JSONDecodeError as exc:
                    errors.append(
                        f"line {line_number}: invalid JSON ({exc.msg} at column {exc.colno})"
                    )
                    continue

                record_count += 1
                if not isinstance(item, dict):
                    errors.append(f"line {line_number}: record must be an object")
                    continue
                errors.extend(_validate_messages(item.get("messages"), line_number))
    except UnicodeDecodeError as exc:
        errors.append(f"file is not valid UTF-8 (byte {exc.start})")
    except OSError as exc:
        errors.append(f"could not read file: {exc}")

    if record_count < minimum_records:
        errors.append(
            f"dataset must contain at least {minimum_records} records "
            f"(found {record_count})"
        )

    return DatasetValidation(candidate, not errors, record_count, tuple(errors))


def discover_jsonl(roots: Iterable[tuple[str, str | Path]]) -> list[DatasetRecord]:
    """Discover and deterministically number JSONL files under named roots."""

    found: dict[str, tuple[Path, str]] = {}
    for source, raw_root in roots:
        root = Path(raw_root).expanduser().resolve()
        if not root.is_dir():
            continue
        try:
            candidates = root.rglob("*.jsonl")
            for candidate in candidates:
                if not candidate.is_file():
                    continue
                resolved = candidate.resolve()
                found.setdefault(str(resolved).casefold(), (resolved, source))
        except OSError:
            # An inaccessible optional discovery root should not make the CLI fail.
            continue

    ordered = sorted(
        found.values(),
        key=lambda item: (item[0].stem.casefold(), str(item[0]).casefold()),
    )
    return [
        DatasetRecord(
            id=f"D{index}",
            name=path.stem,
            path=path,
            size_bytes=path.stat().st_size,
            source=source,
        )
        for index, (path, source) in enumerate(ordered, 1)
    ]
