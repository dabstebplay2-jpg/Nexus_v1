import httpx
from fastapi import APIRouter, HTTPException

from app.config import CLOUD_SERVER_URL, HTTPX_CLIENT_KWARGS
from app.schemas import LocalLoginRequest, LocalRegisterRequest
from app.tokens import cloud_request, delete_local_tokens, get_local_tokens, save_tokens_locally

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def local_register_proxy(req: LocalRegisterRequest):
    async with httpx.AsyncClient(**HTTPX_CLIENT_KWARGS) as client:
        try:
            res = await client.post(
                f"{CLOUD_SERVER_URL}/v1/auth/register",
                json={"email": req.email, "password": req.password, "tier": req.tier},
                timeout=15.0,
            )
            if res.status_code != 200:
                raise HTTPException(
                    status_code=res.status_code,
                    detail=res.json().get("detail", "Error during registration"),
                )

            data = res.json()
            save_tokens_locally(data["access_token"], data.get("refresh_token", ""))
            return {
                "status": "success",
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", ""),
                "token_type": data.get("token_type", "bearer"),
            }
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Cloud Server unavailable: {str(e)}")


@router.post("/login")
async def local_login_proxy(req: LocalLoginRequest):
    async with httpx.AsyncClient(**HTTPX_CLIENT_KWARGS) as client:
        try:
            res = await client.post(
                f"{CLOUD_SERVER_URL}/v1/auth/login",
                json={"email": req.email, "password": req.password},
                timeout=15.0,
            )
            if res.status_code != 200:
                raise HTTPException(
                    status_code=res.status_code,
                    detail=res.json().get("detail", "Invalid email or password"),
                )

            data = res.json()
            save_tokens_locally(data["access_token"], data.get("refresh_token", ""))
            return {
                "status": "success",
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", ""),
                "token_type": data.get("token_type", "bearer"),
            }
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Cloud Server unavailable: {str(e)}")


@router.post("/refresh")
async def local_refresh_proxy(body: dict):
    async with httpx.AsyncClient(**HTTPX_CLIENT_KWARGS) as client:
        res = await client.post(
            f"{CLOUD_SERVER_URL}/v1/auth/refresh",
            json={"refresh_token": body.get("refresh_token", "")},
            timeout=15.0,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.json().get("detail", "Refresh failed"))
        data = res.json()
        save_tokens_locally(data["access_token"], data.get("refresh_token", ""))
        return data


@router.post("/logout")
def local_logout():
    delete_local_tokens()
    return {"status": "success"}


@router.post("/repair-routerai")
async def repair_routerai_proxy():
    """Один новый ключ RouterAI (после смены тарифа или 401 в чате)."""
    res = await cloud_request("POST", "/v1/auth/repair-routerai", json_data={})
    if res.status_code != 200:
        detail = res.json().get("detail", res.text) if res.content else res.text
        raise HTTPException(status_code=res.status_code, detail=detail)
    return res.json()


@router.get("/profile")
async def local_profile_proxy():
    access, _ = get_local_tokens()
    if not access:
        return {"authorized": False, "profile": None}
    res = await cloud_request("GET", "/v1/auth/profile")
    if res.status_code == 401:
        delete_local_tokens()
        return {"authorized": False, "profile": None}
    if res.status_code != 200:
        return {"authorized": False, "profile": None}
    return {"authorized": True, "profile": res.json()}
