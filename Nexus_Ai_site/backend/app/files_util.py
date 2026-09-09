import os
import tkinter as tk
from tkinter import filedialog


def resolve_child_path(parent_path: str, name: str) -> str:
    """Return a direct child path without allowing separators or traversal."""
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Name is required")
    name = name.strip()
    if name in {".", ".."} or os.path.basename(name) != name or os.path.isabs(name):
        raise ValueError("Name must not contain path separators")

    parent = os.path.realpath(os.path.abspath(parent_path))
    if not os.path.isdir(parent):
        raise ValueError("Parent folder does not exist")
    target = os.path.realpath(os.path.join(parent, name))
    if os.path.commonpath([parent, target]) != parent:
        raise ValueError("Target must stay inside the parent folder")
    return target


def get_directory_tree(path: str):
    abs_path = os.path.abspath(path)
    name = os.path.basename(abs_path)
    if not name:
        name = abs_path

    node = {"name": name, "path": abs_path, "is_dir": os.path.isdir(abs_path)}

    if node["is_dir"]:
        try:
            children = []
            for entry in os.listdir(abs_path):
                if entry.startswith(".") or entry in (
                    "__pycache__",
                    "node_modules",
                    "venv",
                    ".git",
                    "dist",
                ):
                    continue
                full_entry_path = os.path.join(abs_path, entry)
                children.append(get_directory_tree(full_entry_path))

            children.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            node["children"] = children
        except Exception:
            node["children"] = []
    return node


def ask_directory_dialog():
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder_path = filedialog.askdirectory(title="Select Project Directory")
    root.destroy()
    return folder_path
