from __future__ import annotations

import os
import sys

# PyInstaller safety net:
# if local packages are also bundled as data, make sys._MEIPASS importable.
bundle_dir = getattr(sys, "_MEIPASS", None)
if bundle_dir and bundle_dir not in sys.path:
    sys.path.insert(0, bundle_dir)

if getattr(sys, "frozen", False):
    app_dir = os.path.dirname(sys.executable)
    if app_dir and app_dir not in sys.path:
        sys.path.insert(0, app_dir)
