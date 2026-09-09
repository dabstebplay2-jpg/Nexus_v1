"""Paste-friendly secret input without getpass."""

from __future__ import annotations

import os
import sys
from typing import TextIO


def read_api_key(
    prompt: str = "API key: ",
    *,
    input_stream: TextIO | None = None,
    output_stream: TextIO | None = None,
) -> str:
    """Read a secret from Windows console, pasted text, or ordinary stdin.

    Interactive Windows input is masked and accepts terminal paste events.
    Redirected stdin uses readline so setup can also be automated.
    """
    source = input_stream or sys.stdin
    target = output_stream or sys.stdout
    target.write(prompt)
    target.flush()

    if source is not sys.stdin or not getattr(source, "isatty", lambda: False)():
        return source.readline().rstrip("\r\n")
    if os.name == "nt":
        return _read_windows_masked(target)
    return _read_posix_masked(source, target)


def _read_windows_masked(target: TextIO) -> str:
    import msvcrt

    characters: list[str] = []
    while True:
        character = msvcrt.getwch()
        if character in {"\r", "\n"}:
            target.write("\n")
            target.flush()
            return "".join(characters)
        if character == "\003":
            raise KeyboardInterrupt
        if character == "\x16":  # Ctrl+V for classic Windows consoles.
            pasted = _windows_clipboard_text().strip("\r\n")
            if pasted:
                characters.extend(pasted)
                target.write("*" * len(pasted))
                target.flush()
            continue
        if character in {"\b", "\x7f"}:
            if characters:
                characters.pop()
                target.write("\b \b")
                target.flush()
            continue
        if character in {"\x00", "\xe0"}:
            msvcrt.getwch()
            continue
        characters.append(character)
        target.write("*")
        target.flush()


def _windows_clipboard_text() -> str:
    import ctypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    if not user32.OpenClipboard(None):
        return ""
    try:
        handle = user32.GetClipboardData(13)  # CF_UNICODETEXT
        if not handle:
            return ""
        kernel32.GlobalLock.restype = ctypes.c_void_p
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            return ""
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


def _read_posix_masked(source: TextIO, target: TextIO) -> str:
    import termios

    descriptor = source.fileno()
    settings = termios.tcgetattr(descriptor)
    try:
        updated = list(settings)
        updated[3] &= ~termios.ECHO
        termios.tcsetattr(descriptor, termios.TCSADRAIN, updated)
        return source.readline().rstrip("\r\n")
    finally:
        termios.tcsetattr(descriptor, termios.TCSADRAIN, settings)
        target.write("\n")
        target.flush()


__all__ = ["read_api_key"]
