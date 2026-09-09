import os
import sqlite3

from fastapi import APIRouter, HTTPException

from app.schemas import DBQueryPayload

router = APIRouter(prefix="/api/db", tags=["database"])


@router.get("/schema")
def get_db_schema(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Database file not found")
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        return {"status": "success", "tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
def run_db_query(req: DBQueryPayload):
    if not os.path.exists(req.path):
        return {"status": "error", "message": "Database file not found"}
    try:
        conn = sqlite3.connect(req.path)
        cursor = conn.cursor()
        cursor.execute(req.query)

        if cursor.description:
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            conn.close()
            serializable_rows = [list(row) for row in rows]
            return {
                "status": "success",
                "type": "select",
                "columns": columns,
                "rows": serializable_rows,
            }

        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return {"status": "success", "type": "write", "affected_rows": affected}
    except Exception as e:
        return {"status": "error", "message": str(e)}
