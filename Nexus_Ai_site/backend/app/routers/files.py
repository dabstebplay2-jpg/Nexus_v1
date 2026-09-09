import os
import shutil

from fastapi import APIRouter, HTTPException

from app.files_util import get_directory_tree, resolve_child_path
from app.schemas import CreateItemRequest, DeleteItemRequest, SaveRequest

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/tree")
def read_tree(path: str = "."):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Workspace path not found")
    return get_directory_tree(path)


@router.get("/read")
def read_file_endpoint(path: str):
    if not os.path.exists(path) or os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Invalid file path")
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/write")
def write_file_endpoint(req: SaveRequest):
    try:
        os.makedirs(os.path.dirname(req.path), exist_ok=True)
        with open(req.path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create_file")
def create_file(req: CreateItemRequest):
    try:
        target_path = resolve_child_path(req.parent_path, req.name)
        if os.path.exists(target_path):
            raise HTTPException(status_code=400, detail="File already exists")
        with open(target_path, "w", encoding="utf-8") as f:
            f.write("")
        return {"status": "success", "path": target_path}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create_folder")
def create_folder(req: CreateItemRequest):
    try:
        target_path = resolve_child_path(req.parent_path, req.name)
        if os.path.exists(target_path):
            raise HTTPException(status_code=400, detail="Folder already exists")
        os.makedirs(target_path, exist_ok=True)
        return {"status": "success", "path": target_path}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete")
def delete_item(req: DeleteItemRequest):
    try:
        if not os.path.exists(req.path):
            raise HTTPException(status_code=404, detail="Item not found")
        if os.path.isdir(req.path):
            shutil.rmtree(req.path)
        else:
            os.remove(req.path)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
