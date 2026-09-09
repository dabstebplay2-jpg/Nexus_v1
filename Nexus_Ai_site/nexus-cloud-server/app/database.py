import logging
from pathlib import Path

from passlib.context import CryptContext
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    text,
)
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import DATABASE_URL, database_backend
from app.time_utils import utc_now

logger = logging.getLogger(__name__)


def _ensure_sqlite_parent_dir(url: str) -> None:
    if "sqlite" not in url:
        return
    try:
        db_path = make_url(url).database
    except Exception:
        return
    if not db_path or db_path == ":memory:":
        return
    parent = Path(db_path).parent
    if str(parent) not in ("", ".") and not parent.exists():
        parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_parent_dir(DATABASE_URL)

_is_memory_sqlite = "sqlite" in DATABASE_URL and ":memory:" in DATABASE_URL

_engine_kwargs: dict = {}
if _is_memory_sqlite:
    # Одна in-memory БД на процесс (иначе migrate на старте и Session — разные БД → 500)
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
    _engine_kwargs["poolclass"] = StaticPool
elif database_backend() == "sqlite":
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_pre_ping"] = True

Base = declarative_base()
engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# pbkdf2 — без нативного bcrypt (стабильно на Vercel serverless)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    google_sub = Column(String, unique=True, index=True, nullable=True)
    telegram_id = Column(BigInteger, unique=True, index=True, nullable=True)
    telegram_username = Column(String, nullable=True)
    email_verified_at = Column(DateTime, nullable=True)
    auth_methods = Column(String, nullable=True)
    subscription_tier = Column(String, default="FREE")
    balance = Column(Float, default=0.0)  # USD — legacy topup pool
    routerai_api_key = Column(String, nullable=True)  # legacy, не используется
    routerai_key_id = Column(String, nullable=True)  # legacy, не используется
    polza_api_key_encrypted = Column(Text, nullable=True)
    polza_user_id = Column(String, nullable=True)
    polza_key_id = Column(String, nullable=True)  # id ключа в org Polza (MCP)
    polza_key_updated_at = Column(DateTime, nullable=True)
    polza_connect_required = Column(Integer, default=0)  # legacy, не используется
    openrouter_api_key_encrypted = Column(Text, nullable=True)
    openrouter_key_hash = Column(String, nullable=True)
    openrouter_key_created_at = Column(DateTime, nullable=True)
    refresh_token = Column(String, nullable=True)
    subscription_period_start = Column(DateTime, nullable=True)
    subscription_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class TransactionDB(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)  # USD
    tx_type = Column(String, nullable=False)
    description = Column(String, nullable=True)
    usage_json = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class InvoiceDB(Base):
    __tablename__ = "invoices"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_rub = Column(Float, nullable=False)
    credits_usd = Column(Float, default=0.0)
    # Старое поле SQLite (NOT NULL) — дублируем amount_rub для совместимости
    amount = Column(Float, nullable=False, default=0.0)
    status = Column(String, default="pending")
    yookassa_payment_id = Column(String, nullable=True, index=True)
    subscription_tier = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class FxRateDB(Base):
    __tablename__ = "fx_rates"
    rate_date = Column(String, primary_key=True)
    usd_rub = Column(Float, nullable=False)
    source = Column(String, default="cbr")
    fetched_at = Column(DateTime, default=utc_now)


class LoginCodeDB(Base):
    __tablename__ = "login_codes"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    code_hash = Column(String, nullable=False)
    attempts = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, nullable=False)


class OAuthStateDB(Base):
    __tablename__ = "oauth_states"
    state = Column(String, primary_key=True, index=True)
    pkce_verifier = Column(String, nullable=False)
    return_to = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)


class AuthExchangeCodeDB(Base):
    __tablename__ = "auth_exchange_codes"
    code = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)


class UserArtifactDB(Base):
    """Сохранённые пользователем результаты: изображения, код, экспорты."""

    __tablename__ = "user_artifacts"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    preview = Column(Text, nullable=True)
    content_json = Column(Text, default="{}", nullable=False)
    source_chat_id = Column(String, nullable=True, index=True)
    source_message_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)


class SupportTicketDB(Base):
    __tablename__ = "support_tickets"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    subject = Column(String, nullable=False)
    status = Column(String, default="open", nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now, index=True)
    updated_at = Column(DateTime, default=utc_now, index=True)
    messages = relationship(
        "SupportMessageDB",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )


class SupportMessageDB(Base):
    __tablename__ = "support_messages"
    id = Column(String, primary_key=True, index=True)
    ticket_id = Column(String, ForeignKey("support_tickets.id"), nullable=False, index=True)
    author = Column(String, nullable=False)  # user | admin
    body = Column(Text, nullable=False, default="")
    attachments_json = Column(Text, default="[]", nullable=False)
    created_at = Column(DateTime, default=utc_now, index=True)
    ticket = relationship("SupportTicketDB", back_populates="messages")


class BrowserSyncDB(Base):
    """Синхронизация настроек Nexus Browser между устройствами."""

    __tablename__ = "browser_sync"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    payload_json = Column(Text, default="{}", nullable=False)
    client_version = Column(String, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class UserMemoryDB(Base):
    """Глобальная память пользователя для подстановки в чаты."""

    __tablename__ = "user_memory"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    content = Column(Text, default="", nullable=False)
    enabled = Column(Integer, default=1, nullable=False)  # 1=true for SQLite compat
    auto_learn = Column(Integer, default=1, nullable=False)  # 1=запоминать при «запомни…» в чате
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class UserConnectionDB(Base):
    """Подключённые коннекторы (OAuth / webhook credentials)."""

    __tablename__ = "user_connections"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    connector_id = Column(String, nullable=False, index=True)
    status = Column(String, default="connected", nullable=False)  # connected | error | disconnected
    account_label = Column(String, nullable=True)
    scopes = Column(Text, nullable=True)
    encrypted_credentials = Column(Text, nullable=False, default="{}")
    enabled_for_chat = Column(Integer, default=1, nullable=False)  # 1=true
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class ConnectorOAuthStateDB(Base):
    """PKCE/state для OAuth коннекторов (отдельно от входа Google)."""

    __tablename__ = "connector_oauth_states"
    state = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    connector_id = Column(String, nullable=False, index=True)
    pkce_verifier = Column(String, nullable=False)
    return_to = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)


class ConnectorAuditLogDB(Base):
    """Аудит вызовов tools коннекторов."""

    __tablename__ = "connector_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    connector_id = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)
    meta_json = Column(Text, default="{}", nullable=False)
    created_at = Column(DateTime, default=utc_now, index=True)


class PlatformSettingsDB(Base):
    """Singleton: депозит RouterAI владельца и метаданные алертов."""

    __tablename__ = "platform_settings"
    id = Column(Integer, primary_key=True, default=1)
    routerai_deposit_usd = Column(Float, default=0.0)
    polza_org_balance_rub = Column(Float, default=0.0)
    last_funding_alert_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class OAuthPkceSessionDB(Base):
    """Временное хранилище PKCE для OAuth Polza.ai."""

    __tablename__ = "oauth_pkce_sessions"
    state = Column(String, primary_key=True, index=True)
    code_verifier = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now)


class PlatformFundingObligationDB(Base):
    """Обязательство пополнить RouterAI после оплаты подписки (идемпотентно по invoice)."""

    __tablename__ = "platform_funding_obligations"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_rub = Column(Float, nullable=False)
    pool_usd = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now)


class ChatConversationDB(Base):
    """История основного чата и диалогов внутри пространств."""

    __tablename__ = "chat_conversations"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, default="Новый чат", nullable=False)
    model = Column(String, nullable=True)
    messages_json = Column(Text, default="[]", nullable=False)
    workspace_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, index=True)


class WorkspaceDB(Base):
    """Пользовательское пространство, объединяющее тематические диалоги."""

    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("user_id", "workspace_id", name="uq_workspace_user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(String, nullable=False, index=True)
    name = Column(String, default="Моё пространство", nullable=False)
    emoji = Column(String, default="✨", nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, index=True)


_USER_COLUMNS = {
    "routerai_api_key": "TEXT",
    "routerai_key_id": "TEXT",
    "polza_api_key_encrypted": "TEXT",
    "polza_user_id": "TEXT",
    "polza_key_id": "TEXT",
    "polza_key_updated_at": "DATETIME",
    "polza_connect_required": "INTEGER",
    "openrouter_api_key_encrypted": "TEXT",
    "openrouter_key_hash": "TEXT",
    "openrouter_key_created_at": "DATETIME",
    "subscription_period_start": "DATETIME",
    "subscription_period_end": "DATETIME",
    "google_sub": "TEXT",
    "telegram_id": "BIGINT",
    "telegram_username": "TEXT",
    "email_verified_at": "DATETIME",
    "auth_methods": "TEXT",
}
_INVOICE_COLUMNS = {
    "amount_rub": "REAL",
    "credits_usd": "REAL",
    "yookassa_payment_id": "TEXT",
    "subscription_tier": "TEXT",
}


def _migrate_user_columns(conn, user_cols: set[str], dialect: str) -> None:
    for col, sql_type in _USER_COLUMNS.items():
        if col in user_cols:
            continue
        if dialect == "sqlite":
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {sql_type}"))
        else:
            pg_type = sql_type.replace("DATETIME", "TIMESTAMP").replace("TEXT", "VARCHAR")
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {pg_type}"))
        logger.info("DB migrate: users.%s", col)
        user_cols.add(col)


def migrate_schema() -> None:
    Base.metadata.create_all(bind=engine)
    dialect = "postgresql" if DATABASE_URL.startswith("postgresql") else "sqlite"
    with engine.connect() as conn:
        if dialect == "sqlite":
            user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)"))}
        else:
            from sqlalchemy import inspect

            user_cols = {c["name"] for c in inspect(engine).get_columns("users")}
        _migrate_user_columns(conn, user_cols, dialect)

        if dialect == "sqlite":
            inv_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(invoices)"))}
        else:
            from sqlalchemy import inspect

            inv_cols = {c["name"] for c in inspect(engine).get_columns("invoices")}

        if dialect == "sqlite" and "amount" in inv_cols and "amount_rub" not in inv_cols:
            conn.execute(text("ALTER TABLE invoices ADD COLUMN amount_rub REAL"))
            conn.execute(text("UPDATE invoices SET amount_rub = amount WHERE amount_rub IS NULL"))
            logger.info("DB migrate: invoices.amount_rub from amount")
            inv_cols.add("amount_rub")

        for col, sql_type in _INVOICE_COLUMNS.items():
            if col in inv_cols:
                continue
            if dialect == "sqlite":
                conn.execute(text(f"ALTER TABLE invoices ADD COLUMN {col} {sql_type}"))
            else:
                pg_type = sql_type.replace("TEXT", "VARCHAR")
                conn.execute(text(f"ALTER TABLE invoices ADD COLUMN {col} {pg_type}"))
            logger.info("DB migrate: invoices.%s", col)
            inv_cols.add(col)

        if dialect == "sqlite":
            inv_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(invoices)"))}
            if "amount_rub" in inv_cols and "amount" in inv_cols:
                conn.execute(
                    text(
                        "UPDATE invoices SET amount = amount_rub "
                        "WHERE amount_rub IS NOT NULL AND (amount IS NULL OR amount = 0)"
                    )
                )

        if dialect == "sqlite":
            tx_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(transactions)"))}
        else:
            from sqlalchemy import inspect

            tx_cols = {c["name"] for c in inspect(engine).get_columns("transactions")}
        if "usage_json" not in tx_cols:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE transactions ADD COLUMN usage_json TEXT"))
            else:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN usage_json VARCHAR"))
            logger.info("DB migrate: transactions.usage_json")

        if dialect == "sqlite":
            mem_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user_memory)"))}
        else:
            from sqlalchemy import inspect

            insp = inspect(engine)
            mem_cols = (
                {c["name"] for c in insp.get_columns("user_memory")}
                if insp.has_table("user_memory")
                else set()
            )
        if mem_cols and "auto_learn" not in mem_cols:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE user_memory ADD COLUMN auto_learn INTEGER NOT NULL DEFAULT 1"))
            else:
                conn.execute(
                    text("ALTER TABLE user_memory ADD COLUMN auto_learn INTEGER NOT NULL DEFAULT 1")
                )
            logger.info("DB migrate: user_memory.auto_learn")

        if "routerai_api_key" in user_cols or "routerai_key_id" in user_cols:
            cleared = conn.execute(
                text(
                    "UPDATE users SET routerai_api_key = NULL, routerai_key_id = NULL "
                    "WHERE routerai_api_key IS NOT NULL OR routerai_key_id IS NOT NULL"
                )
            )
            if getattr(cleared, "rowcount", 0):
                logger.info("DB migrate: cleared legacy RouterAI keys from %s users", cleared.rowcount)

        conn.commit()

    ensure_support_tables()


def ensure_support_tables() -> None:
    """Создать таблицы поддержки, если их ещё нет (после деплоя без полного migrate)."""
    from sqlalchemy import inspect

    insp = inspect(engine)
    missing = [
        name
        for name in ("support_tickets", "support_messages")
        if not insp.has_table(name)
    ]
    if not missing:
        return
    logger.warning("DB migrate: creating support tables: %s", ", ".join(missing))
    Base.metadata.create_all(
        bind=engine,
        tables=[SupportTicketDB.__table__, SupportMessageDB.__table__],
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
