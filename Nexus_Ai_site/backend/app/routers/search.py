import os

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search")
def search_files(query: str, path: str = "."):
    if not query:
        return []
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Workspace path not found")

    results = []
    for root, dirs, files in os.walk(abs_path):
        dirs[:] = [
            d
            for d in dirs
            if not (d.startswith(".") or d in ("node_modules", "venv", "__pycache__", "dist", ".git"))
        ]
        for file in files:
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        if query.lower() in line.lower():
                            results.append(
                                {
                                    "file_path": file_path,
                                    "relative_path": os.path.relpath(file_path, abs_path),
                                    "line_num": line_num,
                                    "text": line.strip(),
                                }
                            )
            except Exception:
                continue
    return results
