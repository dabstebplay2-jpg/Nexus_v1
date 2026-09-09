import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import (
    NEXUS_ADMIN_DEFAULT_CLOUD_URL,
    NEXUS_LOCAL_ADMIN,
    NEXUS_MODELS_REFRESH_INTERVAL_SEC,
    NEXUS_REMOTE_ADMIN,
    POLZA_BACKEND_API_KEY,
    admin_api_enabled,
    admin_cors_origins,
    database_backend,
    database_is_ephemeral,
    is_testing_mode,
    redis_persistence_enabled,
)
from app.database import migrate_schema  # noqa: F401 — used in middleware
from app.routers import (
    ai,
    artifacts,
    auth,
    billing,
    browser_sync,
    chats,
    connectors,
    internal_admin,
    memory,
    polza_auth,
    spaces,
    support,
    telegram,
    testing,
)
from app.services.fx_rates import refresh_usd_rub_rate

logger = logging.getLogger(__name__)
_background_tasks: set[asyncio.Task] = set()


def _start_background_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


@asynccontextmanager
async def _lifespan(_: FastAPI):
    await _startup()
    try:
        yield
    finally:
        tasks = list(_background_tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(
    title="Nexus Cloud Authorization & Billing Server v2.0",
    lifespan=_lifespan,
)
app.state.db_ready = False
app.state.redis_hydrate_done = True


@app.middleware("http")
async def _ensure_db_schema(request, call_next):
    if not getattr(app.state, "db_ready", False):
        migrate_schema()
        app.state.db_ready = True
    if not getattr(app.state, "redis_hydrate_done", True):
        path = request.url.path
        if path not in ("/health", "/v1/health"):
            return JSONResponse(
                status_code=503,
                content={"detail": "Инициализация хранилища, повторите через несколько секунд."},
            )
    return await call_next(request)


@app.get("/health")
@app.get("/v1/health")
def health(verbose: bool = False):
    payload: dict = {"status": "ok", "service": "nexus-cloud"}
    if verbose:
        from sqlalchemy import inspect

        from app.database import engine

        insp = inspect(engine)
        payload.update(
            {
                "testing_mode": is_testing_mode(),
                "default_testing_tier": "ULTRA" if is_testing_mode() else None,
                "database": database_backend(),
                "database_persistent": not database_is_ephemeral(),
                "redis_persistence": redis_persistence_enabled(),
                "support_ready": insp.has_table("support_tickets") and insp.has_table("support_messages"),
            }
        )
    return payload


async def _background_warmup() -> None:
    """Тяжёлая инициализация — не блокирует bind порта на Render."""
    from app.config import redis_persistence_enabled
    from app.services.redis_sync import hydrate_from_redis, install_redis_commit_hook

    if redis_persistence_enabled():
        try:
            n = await asyncio.wait_for(asyncio.to_thread(hydrate_from_redis), timeout=120.0)
            logger.info("Redis hydrate finished (%s users)", n)
        except asyncio.TimeoutError:
            logger.error("Redis hydrate timed out after 120s")
        except Exception as exc:
            logger.exception("Redis hydrate failed: %s", exc)
        finally:
            app.state.redis_hydrate_done = True
        install_redis_commit_hook()

    try:
        rate = await refresh_usd_rub_rate(force=True)
        logger.info("Курс USD/RUB (ЦБ): %.4f", rate)
    except Exception as exc:
        logger.warning("FX refresh on startup failed (non-fatal): %s", exc)

    try:
        from app.services.models_registry import refresh_all_model_sources

        await refresh_all_model_sources(force=True)
        logger.info("Каталоги Polza.ai и OpenRouter прогреты при старте")
    except Exception as exc:
        logger.warning("Прогрев каталога моделей не удался (non-fatal): %s", exc)

    if not os.environ.get("VERCEL"):
        from app.database import SessionLocal, UserDB
        from app.services.polza import suspend_polza_for_user
        from app.services.subscription_guard import enforce_paid_subscription
        from app.tiers import normalize_tier, tier_allows_ai

        db = SessionLocal()
        try:
            for user in db.query(UserDB).all():
                try:
                    await enforce_paid_subscription(db, user, trigger="startup")
                    if not tier_allows_ai(normalize_tier(user.subscription_tier)) and getattr(
                        user, "polza_api_key_encrypted", None
                    ):
                        await suspend_polza_for_user(user, db)
                except Exception as exc:
                    logger.warning("Subscription sync skipped for user %s: %s", user.id, exc)
        finally:
            db.close()

    if POLZA_BACKEND_API_KEY:
        from app.services.polza import PolzaService

        try:
            backend_check = await PolzaService().verify_backend_key()
            if backend_check.get("ok"):
                logger.info(
                    "Polza.ai: backend-ключ OK (баланс org ≈ %.0f ₽).",
                    float(backend_check.get("balance_rub") or 0),
                )
            else:
                logger.error("Polza.ai: %s", backend_check.get("message", "backend-ключ не работает"))
        except Exception as exc:
            logger.warning("Polza backend check failed (non-fatal): %s", exc)
    else:
        logger.warning(
            "Polza.ai: POLZA_BACKEND_API_KEY не задан. Мониторинг org-баланса и MCP недоступны."
        )


async def _startup():
    from app.production_guard import assert_production_config

    logger.info("Nexus Cloud startup: binding port after quick init…")
    assert_production_config()
    migrate_schema()
    app.state.db_ready = True
    app.state.redis_hydrate_done = not (
        redis_persistence_enabled() and database_backend() != "postgresql"
    )

    if database_is_ephemeral():
        logger.warning(
            "База SQLite на хостинге НЕ сохраняется между деплоями — пользователи пропадают. "
            "Подключите PostgreSQL: docs/PERSISTENT_DATABASE_RU.md"
        )
    else:
        logger.info("Database: %s (persistent)", database_backend())

    if admin_api_enabled():
        from app.services.admin_audit import install_admin_log_handler

        install_admin_log_handler()
    if NEXUS_LOCAL_ADMIN:
        logging.getLogger("app.admin_proxy").setLevel(logging.INFO)
        logger.info(
            "Admin UI: http://127.0.0.1:<port>/local-admin/ (cloud: %s) | proxy v2.1",
            NEXUS_ADMIN_DEFAULT_CLOUD_URL,
        )
    if NEXUS_REMOTE_ADMIN:
        logger.info("Remote admin API enabled (password required)")

    if not os.environ.get("VERCEL"):

        async def _fx_daily_loop() -> None:
            while True:
                await asyncio.sleep(3600)
                try:
                    r = await refresh_usd_rub_rate()
                    logger.info("FX hourly refresh: %.4f", r)
                except Exception as exc:
                    logger.warning("FX hourly refresh failed: %s", exc)

        async def _models_daily_loop() -> None:
            from app.services.models_registry import refresh_all_model_sources

            while True:
                await asyncio.sleep(NEXUS_MODELS_REFRESH_INTERVAL_SEC)
                try:
                    await refresh_all_model_sources(force=True)
                    logger.info(
                        "Model catalogs background refresh completed (every %s sec)",
                        NEXUS_MODELS_REFRESH_INTERVAL_SEC,
                    )
                except Exception as exc:
                    logger.warning("Model catalogs background refresh failed: %s", exc)

        _start_background_task(_fx_daily_loop())
        _start_background_task(_models_daily_loop())

    _start_background_task(_background_warmup())
    logger.info("Nexus Cloud ready — background warmup started")

_cors_origins = admin_cors_origins()
_cors_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app",
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(polza_auth.router)
app.include_router(billing.router)
app.include_router(chats.router)
app.include_router(spaces.router)
app.include_router(memory.router)
app.include_router(browser_sync.router)
app.include_router(artifacts.router)
app.include_router(ai.router)
app.include_router(telegram.router)
app.include_router(connectors.router)
app.include_router(support.router)
app.include_router(testing.router)
app.include_router(internal_admin.router)

def _admin_static_directory() -> Path | None:
    """React build (admin_ui/dist) или legacy admin_ui/legacy."""
    root = Path(__file__).resolve().parent.parent / "admin_ui"
    dist = root / "dist"
    if dist.is_dir() and (dist / "index.html").is_file():
        return dist
    legacy = root / "legacy"
    if legacy.is_dir() and (legacy / "index.html").is_file():
        return legacy
    return None


if admin_api_enabled():
    from app.routers import local_admin

    app.include_router(local_admin.router)

if NEXUS_LOCAL_ADMIN:
    from app.routers import admin_proxy

    app.include_router(admin_proxy.router)

if admin_api_enabled():
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles

    _admin_static = _admin_static_directory()
    if _admin_static is not None:

        @app.get("/local-admin/bootstrap.json", include_in_schema=False)
        def _admin_bootstrap():
            proxy_version = "0"
            if NEXUS_LOCAL_ADMIN:
                from app.routers.admin_proxy import PROXY_VERSION

                proxy_version = PROXY_VERSION
            return JSONResponse(
                {
                    "defaultCloudUrl": NEXUS_ADMIN_DEFAULT_CLOUD_URL,
                    "localApiBase": "/v1/local-admin",
                    "proxyApiBase": "/v1/admin-cloud-proxy",
                    "proxyVersion": proxy_version,
                    "recommendedPort": 8790,
                }
            )

        app.mount(
            "/local-admin",
            StaticFiles(directory=str(_admin_static), html=True),
            name="local-admin-ui",
        )

        @app.get("/admin", include_in_schema=False)
        def _admin_redirect():
            return RedirectResponse(url="/local-admin/")
