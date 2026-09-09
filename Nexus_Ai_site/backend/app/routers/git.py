import os
import subprocess

from fastapi import APIRouter, HTTPException

from app.schemas import DeleteItemRequest, GitCommitPayload

router = APIRouter(prefix="/api/git", tags=["git"])


@router.get("/status")
def git_status(path: str = "."):
    abs_path = os.path.abspath(path)
    try:
        res = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=abs_path,
            capture_output=True,
            text=True,
            timeout=3,
        )
        if res.returncode != 0:
            return {"is_git": False, "files": [], "branch": "None"}

        branch_res = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=abs_path,
            capture_output=True,
            text=True,
            timeout=3,
        )
        branch = branch_res.stdout.strip() or "detached"

        files = []
        for line in res.stdout.splitlines():
            if len(line) > 3:
                status = line[:2].strip()
                file_rel_path = line[3:]
                files.append({"path": file_rel_path, "status": status})

        return {"is_git": True, "files": files, "branch": branch}
    except Exception:
        return {"is_git": False, "files": [], "branch": "None"}


@router.post("/commit")
def git_commit_action(req: GitCommitPayload):
    try:
        subprocess.run(["git", "add", "."], cwd=req.path, capture_output=True, text=True, timeout=5)
        res = subprocess.run(
            ["git", "commit", "-m", req.message],
            cwd=req.path,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if res.returncode != 0:
            return {"status": "error", "message": res.stderr}
        return {"status": "success", "output": res.stdout}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/push")
def git_push_action(req: DeleteItemRequest):
    try:
        res = subprocess.run(
            ["git", "push"], cwd=req.path, capture_output=True, text=True, timeout=15
        )
        if res.returncode != 0:
            return {"status": "error", "message": res.stderr}
        return {"status": "success", "output": res.stdout}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
