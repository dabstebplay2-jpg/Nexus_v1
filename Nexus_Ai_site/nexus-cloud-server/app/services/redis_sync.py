"""Персистентность через Upstash Redis REST (снимок SQLite-таблиц)."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from datetime import datetime
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL, redis_persistence_enabled
from app.database import (
    ChatConversationDB,
    FxRateDB,
    InvoiceDB,
    PlatformSettingsDB,
    SessionLocal,
    SupportMessageDB,
    SupportTicketDB,
    TransactionDB,
    UserArtifactDB,
    UserConnectionDB,
    UserDB,
    UserMemoryDB,
    WorkspaceDB,
)
from app.services.detailed_log import get_logger, log_detail
from app.time_utils import utc_now

logger = get_logger("redis")

_SNAPSHOT_KEY_V1 = "nexus:v1:db_snapshot"
_SNAPSHOT_KEY_V2 = "nexus:v2:db_snapshot"
_SNAPSHOT_KEY = "nexus:v3:db_snapshot"
_SNAPSHOT_VERSION = 5
_hook_installed = False


_REDIS_IO_TIMEOUT_SEC = 45.0


def _redis_client():
    from upstash_redis import Redis

    return Redis(url=UPSTASH_REDIS_REST_URL, token=UPSTASH_REDIS_REST_TOKEN)


def _redis_get(key: str):
    """Upstash REST без явного таймаута — ограничиваем ожидание."""
    client = _redis_client()

    def _call():
        return client.get(key)

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_call)
        return future.result(timeout=_REDIS_IO_TIMEOUT_SEC)


def _serialize_dt(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _deserialize_dt(value: Any) -> Any:
    if value is None or not isinstance(value, str):
        return value
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    except ValueError:
        return value


def _user_to_dict(u: UserDB) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "hashed_password": u.hashed_password,
        "google_sub": getattr(u, "google_sub", None),
        "telegram_id": getattr(u, "telegram_id", None),
        "telegram_username": getattr(u, "telegram_username", None),
        "email_verified_at": _serialize_dt(getattr(u, "email_verified_at", None)),
        "auth_methods": getattr(u, "auth_methods", None),
        "subscription_tier": u.subscription_tier,
        "balance": u.balance,
        "polza_api_key_encrypted": getattr(u, "polza_api_key_encrypted", None),
        "polza_user_id": getattr(u, "polza_user_id", None),
        "polza_key_id": getattr(u, "polza_key_id", None),
        "polza_key_updated_at": _serialize_dt(getattr(u, "polza_key_updated_at", None)),
        "polza_connect_required": getattr(u, "polza_connect_required", None),
        "openrouter_api_key_encrypted": getattr(u, "openrouter_api_key_encrypted", None),
        "openrouter_key_hash": getattr(u, "openrouter_key_hash", None),
        "openrouter_key_created_at": _serialize_dt(getattr(u, "openrouter_key_created_at", None)),
        "refresh_token": u.refresh_token,
        "subscription_period_start": _serialize_dt(u.subscription_period_start),
        "subscription_period_end": _serialize_dt(u.subscription_period_end),
        "created_at": _serialize_dt(u.created_at),
    }


def _user_from_dict(d: dict) -> UserDB:
    return UserDB(
        id=d["id"],
        email=d["email"],
        hashed_password=d.get("hashed_password"),
        google_sub=d.get("google_sub"),
        telegram_id=d.get("telegram_id"),
        telegram_username=d.get("telegram_username"),
        email_verified_at=_deserialize_dt(d.get("email_verified_at")),
        auth_methods=d.get("auth_methods"),
        subscription_tier=d.get("subscription_tier", "FREE"),
        balance=float(d.get("balance") or 0),
        routerai_api_key=d.get("routerai_api_key"),
        routerai_key_id=d.get("routerai_key_id"),
        polza_api_key_encrypted=d.get("polza_api_key_encrypted"),
        polza_user_id=d.get("polza_user_id"),
        polza_key_id=d.get("polza_key_id"),
        polza_key_updated_at=_deserialize_dt(d.get("polza_key_updated_at")),
        polza_connect_required=d.get("polza_connect_required"),
        openrouter_api_key_encrypted=d.get("openrouter_api_key_encrypted"),
        openrouter_key_hash=d.get("openrouter_key_hash"),
        openrouter_key_created_at=_deserialize_dt(d.get("openrouter_key_created_at")),
        refresh_token=d.get("refresh_token"),
        subscription_period_start=_deserialize_dt(d.get("subscription_period_start")),
        subscription_period_end=_deserialize_dt(d.get("subscription_period_end")),
        created_at=_deserialize_dt(d.get("created_at")),
    )


def _tx_to_dict(t: TransactionDB) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "amount": t.amount,
        "tx_type": t.tx_type,
        "description": t.description,
        "usage_json": getattr(t, "usage_json", None),
        "created_at": _serialize_dt(t.created_at),
    }


def _tx_from_dict(d: dict) -> TransactionDB:
    return TransactionDB(
        id=d["id"],
        user_id=d["user_id"],
        amount=float(d["amount"]),
        tx_type=d["tx_type"],
        description=d.get("description"),
        usage_json=d.get("usage_json"),
        created_at=_deserialize_dt(d.get("created_at")),
    )


def _inv_to_dict(i: InvoiceDB) -> dict:
    return {
        "id": i.id,
        "user_id": i.user_id,
        "amount_rub": i.amount_rub,
        "credits_usd": i.credits_usd,
        "amount": i.amount,
        "status": i.status,
        "yookassa_payment_id": getattr(i, "yookassa_payment_id", None),
        "subscription_tier": getattr(i, "subscription_tier", None),
        "created_at": _serialize_dt(i.created_at),
    }


def _inv_from_dict(d: dict) -> InvoiceDB:
    return InvoiceDB(
        id=d["id"],
        user_id=d["user_id"],
        amount_rub=float(d.get("amount_rub") or d.get("amount") or 0),
        credits_usd=float(d.get("credits_usd") or 0),
        amount=float(d.get("amount") or d.get("amount_rub") or 0),
        status=d.get("status", "pending"),
        yookassa_payment_id=d.get("yookassa_payment_id"),
        subscription_tier=d.get("subscription_tier"),
        created_at=_deserialize_dt(d.get("created_at")),
    )


def _fx_to_dict(f: FxRateDB) -> dict:
    return {
        "rate_date": f.rate_date,
        "usd_rub": f.usd_rub,
        "source": f.source,
        "fetched_at": _serialize_dt(f.fetched_at),
    }


def _fx_from_dict(d: dict) -> FxRateDB:
    return FxRateDB(
        rate_date=d["rate_date"],
        usd_rub=float(d["usd_rub"]),
        source=d.get("source", "cbr"),
        fetched_at=_deserialize_dt(d.get("fetched_at")),
    )


def _chat_to_dict(c: ChatConversationDB) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "title": c.title,
        "model": c.model,
        "messages_json": c.messages_json,
        "workspace_id": c.workspace_id,
        "created_at": _serialize_dt(c.created_at),
        "updated_at": _serialize_dt(c.updated_at),
    }


def _chat_from_dict(d: dict) -> ChatConversationDB:
    return ChatConversationDB(
        id=d["id"],
        user_id=d["user_id"],
        title=d.get("title") or "Новый чат",
        model=d.get("model"),
        messages_json=d.get("messages_json") or "[]",
        workspace_id=d.get("workspace_id"),
        created_at=_deserialize_dt(d.get("created_at")),
        updated_at=_deserialize_dt(d.get("updated_at")),
    )


def _workspace_to_dict(workspace: WorkspaceDB) -> dict:
    return {
        "id": workspace.id,
        "user_id": workspace.user_id,
        "workspace_id": workspace.workspace_id,
        "name": workspace.name,
        "emoji": workspace.emoji,
        "created_at": _serialize_dt(workspace.created_at),
        "updated_at": _serialize_dt(workspace.updated_at),
    }


def _workspace_from_dict(data: dict) -> WorkspaceDB:
    return WorkspaceDB(
        id=data.get("id"),
        user_id=data["user_id"],
        workspace_id=data["workspace_id"],
        name=data.get("name") or "Моё пространство",
        emoji=data.get("emoji") or "✨",
        created_at=_deserialize_dt(data.get("created_at")),
        updated_at=_deserialize_dt(data.get("updated_at")),
    )


def _ticket_to_dict(t: SupportTicketDB) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "category": t.category,
        "subject": t.subject,
        "status": t.status,
        "created_at": _serialize_dt(t.created_at),
        "updated_at": _serialize_dt(t.updated_at),
    }


def _ticket_from_dict(d: dict) -> SupportTicketDB:
    return SupportTicketDB(
        id=d["id"],
        user_id=d["user_id"],
        category=d["category"],
        subject=d["subject"],
        status=d.get("status", "open"),
        created_at=_deserialize_dt(d.get("created_at")),
        updated_at=_deserialize_dt(d.get("updated_at")),
    )


def _support_msg_to_dict(m: SupportMessageDB) -> dict:
    return {
        "id": m.id,
        "ticket_id": m.ticket_id,
        "author": m.author,
        "body": m.body,
        "attachments_json": m.attachments_json,
        "created_at": _serialize_dt(m.created_at),
    }


def _support_msg_from_dict(d: dict) -> SupportMessageDB:
    return SupportMessageDB(
        id=d["id"],
        ticket_id=d["ticket_id"],
        author=d["author"],
        body=d.get("body") or "",
        attachments_json=d.get("attachments_json") or "[]",
        created_at=_deserialize_dt(d.get("created_at")),
    )


def _artifact_to_dict(a: UserArtifactDB) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "kind": a.kind,
        "title": a.title,
        "preview": a.preview,
        "content_json": a.content_json,
        "source_chat_id": a.source_chat_id,
        "source_message_id": a.source_message_id,
        "created_at": _serialize_dt(a.created_at),
    }


def _artifact_from_dict(d: dict) -> UserArtifactDB:
    return UserArtifactDB(
        id=d["id"],
        user_id=d["user_id"],
        kind=d["kind"],
        title=d["title"],
        preview=d.get("preview"),
        content_json=d.get("content_json") or "{}",
        source_chat_id=d.get("source_chat_id"),
        source_message_id=d.get("source_message_id"),
        created_at=_deserialize_dt(d.get("created_at")),
    )


def _memory_to_dict(m: UserMemoryDB) -> dict:
    return {
        "user_id": m.user_id,
        "content": m.content,
        "enabled": m.enabled,
        "auto_learn": getattr(m, "auto_learn", 1),
        "updated_at": _serialize_dt(m.updated_at),
    }


def _memory_from_dict(d: dict) -> UserMemoryDB:
    return UserMemoryDB(
        user_id=d["user_id"],
        content=d.get("content") or "",
        enabled=int(d.get("enabled", 1)),
        auto_learn=int(d.get("auto_learn", 1)),
        updated_at=_deserialize_dt(d.get("updated_at")),
    )


def _connection_to_dict(c: UserConnectionDB) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "connector_id": c.connector_id,
        "status": c.status,
        "account_label": c.account_label,
        "scopes": c.scopes,
        "encrypted_credentials": c.encrypted_credentials,
        "enabled_for_chat": c.enabled_for_chat,
        "expires_at": _serialize_dt(c.expires_at),
        "created_at": _serialize_dt(c.created_at),
        "updated_at": _serialize_dt(c.updated_at),
    }


def _connection_from_dict(d: dict) -> UserConnectionDB:
    return UserConnectionDB(
        id=d["id"],
        user_id=d["user_id"],
        connector_id=d["connector_id"],
        status=d.get("status", "connected"),
        account_label=d.get("account_label"),
        scopes=d.get("scopes"),
        encrypted_credentials=d.get("encrypted_credentials") or "{}",
        enabled_for_chat=int(d.get("enabled_for_chat", 1)),
        expires_at=_deserialize_dt(d.get("expires_at")),
        created_at=_deserialize_dt(d.get("created_at")),
        updated_at=_deserialize_dt(d.get("updated_at")),
    )


def _platform_to_dict(p: PlatformSettingsDB) -> dict:
    return {
        "id": p.id,
        "routerai_deposit_usd": p.routerai_deposit_usd,
        "polza_org_balance_rub": p.polza_org_balance_rub,
        "last_funding_alert_at": _serialize_dt(p.last_funding_alert_at),
        "updated_at": _serialize_dt(p.updated_at),
    }


def _platform_from_dict(d: dict) -> PlatformSettingsDB:
    return PlatformSettingsDB(
        id=int(d.get("id") or 1),
        routerai_deposit_usd=float(d.get("routerai_deposit_usd") or 0),
        polza_org_balance_rub=float(d.get("polza_org_balance_rub") or 0),
        last_funding_alert_at=_deserialize_dt(d.get("last_funding_alert_at")),
        updated_at=_deserialize_dt(d.get("updated_at")),
    )


def export_snapshot(db: Session) -> dict[str, Any]:
    return {
        "v": _SNAPSHOT_VERSION,
        "exported_at": utc_now().isoformat(),
        "users": [_user_to_dict(u) for u in db.query(UserDB).order_by(UserDB.id).all()],
        "transactions": [_tx_to_dict(t) for t in db.query(TransactionDB).order_by(TransactionDB.id).all()],
        "invoices": [_inv_to_dict(i) for i in db.query(InvoiceDB).all()],
        "fx_rates": [_fx_to_dict(f) for f in db.query(FxRateDB).all()],
        "chat_conversations": [_chat_to_dict(c) for c in db.query(ChatConversationDB).all()],
        "workspaces": [_workspace_to_dict(w) for w in db.query(WorkspaceDB).all()],
        "support_tickets": [_ticket_to_dict(t) for t in db.query(SupportTicketDB).all()],
        "support_messages": [_support_msg_to_dict(m) for m in db.query(SupportMessageDB).all()],
        "user_artifacts": [_artifact_to_dict(a) for a in db.query(UserArtifactDB).all()],
        "user_memory": [_memory_to_dict(m) for m in db.query(UserMemoryDB).all()],
        "user_connections": [_connection_to_dict(c) for c in db.query(UserConnectionDB).all()],
        "platform_settings": [
            _platform_to_dict(p) for p in db.query(PlatformSettingsDB).all()
        ],
    }


def _clear_tables(db: Session) -> None:
    db.query(SupportMessageDB).delete()
    db.query(SupportTicketDB).delete()
    db.query(TransactionDB).delete()
    db.query(InvoiceDB).delete()
    db.query(ChatConversationDB).delete()
    db.query(WorkspaceDB).delete()
    db.query(UserArtifactDB).delete()
    db.query(UserMemoryDB).delete()
    db.query(UserConnectionDB).delete()
    db.query(PlatformSettingsDB).delete()
    db.query(UserDB).delete()
    db.query(FxRateDB).delete()
    db.commit()


def import_snapshot(db: Session, data: dict[str, Any]) -> int:
    if not data or not data.get("users") and not data.get("transactions"):
        return 0
    _clear_tables(db)
    for row in data.get("users") or []:
        db.add(_user_from_dict(row))
    for row in data.get("transactions") or []:
        db.add(_tx_from_dict(row))
    for row in data.get("invoices") or []:
        db.add(_inv_from_dict(row))
    for row in data.get("fx_rates") or []:
        db.add(_fx_from_dict(row))
    for row in data.get("chat_conversations") or []:
        db.add(_chat_from_dict(row))
    for row in data.get("workspaces") or []:
        db.add(_workspace_from_dict(row))
    for row in data.get("support_tickets") or []:
        db.add(_ticket_from_dict(row))
    for row in data.get("support_messages") or []:
        db.add(_support_msg_from_dict(row))
    for row in data.get("user_artifacts") or []:
        db.add(_artifact_from_dict(row))
    for row in data.get("user_memory") or []:
        db.add(_memory_from_dict(row))
    for row in data.get("user_connections") or []:
        db.add(_connection_from_dict(row))
    for row in data.get("platform_settings") or []:
        db.add(_platform_from_dict(row))
    db.commit()
    return len(data.get("users") or [])


def persist_snapshot_to_redis(db: Session | None = None) -> None:
    if not redis_persistence_enabled():
        return
    own = db is None
    if own:
        db = SessionLocal()
    try:
        payload = export_snapshot(db)
        raw = json.dumps(payload, ensure_ascii=False)
        client = _redis_client()
        client.set(_SNAPSHOT_KEY, raw)
        log_detail(
            logger,
            "UPSTASH: snapshot сохранён",
            users=len(payload.get("users") or []),
            transactions=len(payload.get("transactions") or []),
            invoices=len(payload.get("invoices") or []),
            chats=len(payload.get("chat_conversations") or []),
            spaces=len(payload.get("workspaces") or []),
            support=len(payload.get("support_tickets") or []),
            key=_SNAPSHOT_KEY,
            bytes=len(raw),
        )
    except Exception as exc:
        logger.exception("Upstash persist failed: %s", exc)
        raise
    finally:
        if own:
            db.close()


def hydrate_from_redis() -> int:
    """Загрузить снимок в SQLite (in-memory на Render). PostgreSQL не трогаем."""
    if not redis_persistence_enabled():
        return 0
    from app.config import database_backend

    if database_backend() == "postgresql":
        log_detail(logger, "UPSTASH: hydrate skipped — PostgreSQL is primary store")
        return 0
    try:
        logger.info("UPSTASH: loading snapshot into %s…", database_backend())
        raw = _redis_get(_SNAPSHOT_KEY)
        snapshot_key = _SNAPSHOT_KEY
        if not raw:
            raw = _redis_get(_SNAPSHOT_KEY_V2)
            snapshot_key = _SNAPSHOT_KEY_V2
        if not raw:
            raw = _redis_get(_SNAPSHOT_KEY_V1)
            snapshot_key = _SNAPSHOT_KEY_V1
        if not raw:
            log_detail(logger, "UPSTASH: snapshot пуст", action="старт с чистой БД")
            return 0
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        data = json.loads(raw) if isinstance(raw, str) else raw
        db = SessionLocal()
        try:
            n = import_snapshot(db, data)
            log_detail(
                logger,
                "UPSTASH: snapshot загружен",
                users=n,
                transactions=len(data.get("transactions") or []),
                invoices=len(data.get("invoices") or []),
                exported_at=data.get("exported_at"),
                key=snapshot_key,
                version=data.get("v"),
            )
            return n
        finally:
            db.close()
    except FuturesTimeoutError:
        logger.error("Upstash hydrate timed out after %.0fs", _REDIS_IO_TIMEOUT_SEC)
        return 0
    except Exception as exc:
        logger.exception("Upstash hydrate failed: %s", exc)
        return 0


def install_redis_commit_hook() -> None:
    global _hook_installed
    if _hook_installed or not redis_persistence_enabled():
        return

    @event.listens_for(Session, "after_commit")
    def _on_commit(_session: Session) -> None:
        try:
            persist_snapshot_to_redis(None)
        except Exception:
            logger.exception("Upstash sync after commit failed")

    _hook_installed = True
    logger.info("Upstash Redis persistence enabled (after_commit sync)")
