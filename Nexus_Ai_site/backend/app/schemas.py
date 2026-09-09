from pydantic import BaseModel, Field


class LocalLoginRequest(BaseModel):
    email: str
    password: str


class LocalRegisterRequest(BaseModel):
    email: str
    password: str
    tier: str = "FREE"


class TopupPayload(BaseModel):
    amount_rub: float


class SubscribePayload(BaseModel):
    tier: str
    promo_code: str | None = None


class SaveRequest(BaseModel):
    path: str
    content: str


class CreateItemRequest(BaseModel):
    parent_path: str
    name: str


class DeleteItemRequest(BaseModel):
    path: str


class HTTPRequestPayload(BaseModel):
    method: str
    url: str
    headers: dict = Field(default_factory=dict)
    body: str = ""


class DBQueryPayload(BaseModel):
    path: str
    query: str


class GitCommitPayload(BaseModel):
    path: str
    message: str


class AIChatRequest(BaseModel):
    prompt: str
    workspace_path: str
    file_context: str = ""
    directory_context: str = ""
    chat_history: list = Field(default_factory=list)
    model: str = "deepseek/deepseek-v4-flash"
