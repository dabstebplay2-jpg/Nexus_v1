from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    tier: Optional[str] = "FREE"


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailRequestCode(BaseModel):
    email: EmailStr


class EmailVerifyCode(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class GoogleExchangeRequest(BaseModel):
    code: str


class TelegramExchangeRequest(BaseModel):
    code: str


class TelegramExchangePreviewResponse(BaseModel):
    user_id: int
    is_telegram_shadow: bool
    telegram_username: Optional[str] = None
    label: str = ""


class TelegramLoginRequest(BaseModel):
    id: int
    first_name: str = ""
    last_name: str = ""
    username: str = ""
    photo_url: str = ""
    auth_date: int
    hash: str


class MessageResponse(BaseModel):
    message: str
    # Возвращается только локально при NEXUS_AUTH_DEV_LOG_CODES=true.
    dev_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    suggest_google_link: bool = False
    has_google_linked: bool = False


class AuthConfigResponse(BaseModel):
    google_oauth_enabled: bool
    email_auth_enabled: bool = True
    telegram_auth_enabled: bool = False
    telegram_bot_username: str | None = None
    telegram_login_domain: str | None = None
    otp_resend_cooldown_sec: int = 60
    otp_email_window_sec: int = 900
    otp_email_max_requests: int = 3
    oauth_redis_enabled: bool = False
    oauth_allowed_origins: list[str] = []
    google_redirect_uri_configured: str | None = None


class ProfileResponse(BaseModel):
    email: str
    email_verified: bool = False
    has_google: bool = False
    telegram_linked: bool = False
    telegram_username: Optional[str] = None
    needs_real_email: bool = False
    subscription_tier: str
    subscription_active: bool = True
    balance: float
    balance_usd: float = 0.0
    balance_rub: float = 0.0
    currency: str = "RUB"
    billing_mode: str = "monthly_quota"
    usd_rub_rate: float = 0.0
    monthly_quota_usd: float = 0.0
    monthly_quota_rub: float = 0.0
    monthly_cap_usd: float = 0.0
    monthly_cap_rub: float = 0.0
    monthly_spent_usd: float = 0.0
    monthly_spent_rub: float = 0.0
    monthly_remaining_usd: float = 0.0
    monthly_remaining_rub: float = 0.0
    monthly_used_percent: float = 0.0
    period_end: Optional[str] = None
    has_polza_key: bool = False
    polza_connect_required: bool = False
    ai_enabled: bool = False
    daily_quota_usd: float = 0.0
    daily_quota_rub: float = 0.0
    daily_cap_usd: float = 0.0
    daily_spent_usd: float = 0.0
    daily_remaining_usd: float = 0.0
    daily_used_percent: float = 0.0
    daily_cap_rub: float = 0.0
    daily_spent_rub: float = 0.0
    daily_remaining_rub: float = 0.0


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool", "developer"]
    content: str | list[Any] = Field(max_length=200_000)

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str | list[Any]) -> str | list[Any]:
        if isinstance(v, str) and not v.strip():
            raise ValueError("message content cannot be empty")
        return v


def _validate_messages(messages: list[ChatMessage]) -> list[ChatMessage]:
    if not messages:
        raise ValueError("messages cannot be empty")
    if len(messages) > 200:
        raise ValueError("too many messages (max 200)")
    return messages


class ChatAttachment(BaseModel):
    kind: Literal["image", "file"]
    name: str = Field(max_length=256)
    mime: str = Field(max_length=128)
    data_base64: str | None = Field(default=None, max_length=6_000_000)
    text: str | None = Field(default=None, max_length=32_000)


class ConversationSourceItem(BaseModel):
    title: str = Field(default="", max_length=500)
    url: str = Field(max_length=2000)
    snippet: str = Field(default="", max_length=2000)


class BrowserPageContext(BaseModel):
    """Page snapshot from Nexus Browser (no HTML/cookies by default)."""

    url: str = Field(default="", max_length=2000)
    title: str = Field(default="", max_length=500)
    excerpt: str = Field(default="", max_length=32_000)
    selection: str | None = Field(default=None, max_length=8_000)
    tab_id: str | None = Field(default=None, max_length=64)


class BrowserAgentStep(BaseModel):
    """Single browser agent tool result (client-side execution)."""

    tool: str = Field(max_length=64)
    args: dict = Field(default_factory=dict)
    result: str = Field(default="", max_length=16_000)


class SimpleChatRequest(BaseModel):
    model: str = Field(max_length=256)
    messages: list[ChatMessage]
    agent_id: Optional[str] = Field(None, max_length=64)
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=8)
    use_web_search: bool = False
    auto_tools: bool = True
    web_search_depth: str = Field(default="standard", max_length=16)
    conversation_sources: list[ConversationSourceItem] = Field(default_factory=list, max_length=80)
    enable_thinking: bool = False
    use_connectors: bool = True
    preferred_image_model: Optional[str] = Field(None, max_length=256)
    page_context: BrowserPageContext | None = None
    browser_agent: bool = False
    browser_agent_steps: list[BrowserAgentStep] = Field(default_factory=list, max_length=24)

    @field_validator("web_search_depth")
    @classmethod
    def normalize_web_search_depth(cls, v: str) -> str:
        key = (v or "standard").strip().lower()
        if key in ("quick", "standard", "deep"):
            return key
        return "standard"

    @field_validator("messages")
    @classmethod
    def check_messages(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        return _validate_messages(v)


class BrowserSearchRequest(BaseModel):
    """Omnibox search-first query from Nexus Browser."""

    query: str = Field(max_length=2_000)
    depth: str = Field(default="quick", max_length=16)


class ResearchRequest(BaseModel):
    model: str = Field(default="", max_length=256)
    query: str = Field(max_length=8_000)
    messages: Optional[list[ChatMessage]] = None
    agent_id: Optional[str] = Field(None, max_length=64)
    depth: str = Field(default="deep", max_length=16)

    @field_validator("messages")
    @classmethod
    def check_messages(cls, v: Optional[list[ChatMessage]]) -> Optional[list[ChatMessage]]:
        if v is None:
            return v
        return _validate_messages(v)


class CloudChatRequest(BaseModel):
    model: str = Field(max_length=256)
    messages: list[ChatMessage]
    tools: Optional[list] = Field(None, max_length=32)
    tool_choice: Optional[str] = Field(None, max_length=64)

    @field_validator("messages")
    @classmethod
    def check_messages(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        return _validate_messages(v)


class TopupRequest(BaseModel):
    amount_rub: float = Field(..., gt=0, description="Сумма пополнения в рублях")


class SubscribeRequest(BaseModel):
    tier: str = Field(max_length=32)
    promo_code: str | None = Field(default=None, max_length=64)


class PromoRedeemRequest(BaseModel):
    code: str = Field(min_length=2, max_length=64)


class StoredChatMessage(BaseModel):
    id: str | None = None
    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = ""
    at: int | float | None = None
    model: str | None = None
    codeFiles: list[dict] | None = None
    sources: list[dict] | None = None
    attachments: list[dict] | None = None
    images: list[dict] | None = None


class ChatConversationPayload(BaseModel):
    id: str = Field(min_length=8, max_length=64)
    title: str = Field(default="Новый чат", max_length=256)
    model: str | None = Field(default=None, max_length=128)
    messages: list[StoredChatMessage] = Field(default_factory=list)
    createdAt: int | float | None = None
    updatedAt: int | float | None = None
    workspaceId: str | None = Field(default=None, max_length=64)


class ChatListResponse(BaseModel):
    conversations: list[ChatConversationPayload]


class ChatSyncRequest(BaseModel):
    conversations: list[ChatConversationPayload] = Field(default_factory=list)


class ChatImportRequest(BaseModel):
    conversations: list[ChatConversationPayload] = Field(default_factory=list)


class WorkspacePayload(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    emoji: str = Field(default="✨", min_length=1, max_length=16)
    createdAt: int | float | None = None
    updatedAt: int | float | None = None


class SpaceStatePayload(BaseModel):
    workspaces: list[WorkspacePayload] = Field(default_factory=list, max_length=40)
    conversations: list[ChatConversationPayload] = Field(default_factory=list, max_length=240)


class SpaceStateResponse(SpaceStatePayload):
    pass


class ArtifactPayload(BaseModel):
    id: str = Field(min_length=8, max_length=64)
    kind: str = Field(max_length=32)
    title: str = Field(max_length=256)
    preview: str | None = None
    content: dict | None = None
    sourceChatId: str | None = Field(default=None, max_length=64)
    sourceMessageId: str | None = Field(default=None, max_length=64)
    createdAt: int | float | None = None


class ArtifactListResponse(BaseModel):
    artifacts: list[ArtifactPayload] = Field(default_factory=list)


class ArtifactSyncRequest(BaseModel):
    artifacts: list[ArtifactPayload] = Field(default_factory=list)


SupportCategory = Literal["complaint", "question", "bug", "other"]
SupportStatus = Literal["open", "answered", "closed"]
SupportAuthor = Literal["user", "admin"]


class SupportAttachmentOut(BaseModel):
    kind: Literal["image", "file"]
    name: str
    mime: str
    preview_url: str | None = None
    text_preview: str | None = None


class SupportMessageOut(BaseModel):
    id: str
    author: SupportAuthor
    body: str
    attachments: list[SupportAttachmentOut] = Field(default_factory=list)
    created_at: str


class SupportTicketCreate(BaseModel):
    category: SupportCategory = "question"
    subject: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=1, max_length=8000)
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=4)


class SupportMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=4)


class SupportTicketSummary(BaseModel):
    id: str
    category: str
    subject: str
    status: str
    created_at: str
    updated_at: str
    last_preview: str | None = None


class SupportTicketDetail(BaseModel):
    id: str
    category: str
    subject: str
    status: str
    created_at: str
    updated_at: str
    messages: list[SupportMessageOut]


class SupportTicketListResponse(BaseModel):
    tickets: list[SupportTicketSummary]


class AdminSupportTicketSummary(SupportTicketSummary):
    user_email: str


class AdminSupportTicketListResponse(BaseModel):
    tickets: list[AdminSupportTicketSummary]


class AdminSupportTicketDetail(SupportTicketDetail):
    user_email: str


class AdminSupportReply(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=4)


class AdminSupportStatusPatch(BaseModel):
    status: SupportStatus
