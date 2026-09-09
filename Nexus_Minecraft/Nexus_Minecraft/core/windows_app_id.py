from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)

APP_USER_MODEL_ID = "NexusMinecraft.Launcher.0.7"


def set_windows_app_id(app_id: str = APP_USER_MODEL_ID) -> bool:
    """Make Windows taskbar group/icon show Nexus instead of python.exe.

    Windows uses the AppUserModelID for taskbar identity. In dev mode a PySide
    app launched with python.exe can otherwise show the generic Python icon.
    """
    if os.name != "nt":
        return False

    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(str(app_id))
        return True
    except Exception:
        logger.debug("Could not set Windows AppUserModelID", exc_info=True)
        return False


def running_from_pyinstaller() -> bool:
    return bool(getattr(sys, "frozen", False))
