import asyncio

import httpx
from fastapi import APIRouter

from app.schemas import HTTPRequestPayload

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.post("/http_request")
async def proxy_http_request(req: HTTPRequestPayload):
    async with httpx.AsyncClient() as client:
        try:
            headers = {str(k): str(v) for k, v in req.headers.items()}
            content = req.body.encode("utf-8") if req.body else None

            start_time = asyncio.get_event_loop().time()
            response = await client.request(
                method=req.method.upper(),
                url=req.url,
                headers=headers,
                content=content,
                timeout=30.0,
            )
            end_time = asyncio.get_event_loop().time()
            duration_ms = int((end_time - start_time) * 1000)

            return {
                "status": "success",
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "text": response.text,
                "time_ms": duration_ms,
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
