import asyncio
import os

from fastapi import APIRouter

from app.files_util import ask_directory_dialog

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


@router.post("/select")
async def select_workspace():
    folder_path = await asyncio.to_thread(ask_directory_dialog)
    if not folder_path:
        return {"status": "cancelled", "path": None}
    return {"status": "success", "path": os.path.abspath(folder_path)}
