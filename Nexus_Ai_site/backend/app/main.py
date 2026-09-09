from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import ai, auth, billing, database, files, git, search, terminal, tools, workspace
from app.tokens import reset_request_bearer, set_request_bearer

app = FastAPI(title="Nexus IDE Backend")


@app.middleware("http")
async def bearer_from_request(request: Request, call_next):
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    tok = set_request_bearer(auth)
    try:
        return await call_next(request)
    finally:
        reset_request_bearer(tok)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(billing.router)
app.include_router(workspace.router)
app.include_router(files.router)
app.include_router(search.router)
app.include_router(git.router)
app.include_router(tools.router)
app.include_router(database.router)
app.include_router(ai.router)
app.include_router(terminal.router)
