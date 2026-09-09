"""Роутинг явных запросов к встроенным инструментам."""

import pytest

from app.database import UserDB
from app.routers import ai
from app.schemas import SimpleChatRequest
from app.services.auto_tool_router import detect_image_generation_intent, route_explicit_tools


@pytest.mark.parametrize(
    "text",
    [
        "Нарисуй космический город ночью",
        "Создай изображение современного офиса",
        "Сделай мне красивую иллюстрацию для сайта",
        "Generate an image of a friendly robot",
        "Can you create a picture for my presentation?",
    ],
)
def test_detects_image_generation(text):
    assert detect_image_generation_intent(text) is True
    assert route_explicit_tools(text).image_generation is True


@pytest.mark.parametrize(
    "text",
    [
        "Как создать изображение в Python?",
        "Найди изображение Марса в интернете",
        "Проанализируй это фото",
        "Не создавай изображение, только опиши сцену",
        "Расскажи, как устроены генераторы изображений",
    ],
)
def test_does_not_route_explanations_or_search(text):
    assert detect_image_generation_intent(text) is False


@pytest.mark.asyncio
async def test_server_switches_text_model_to_image_model(monkeypatch):
    async def image_model(_tier, *, preferred=None):
        assert preferred == "preferred/image"
        return "google/gemini-3.1-flash-lite-image"

    async def allow(_user, _model, **_kwargs):
        return None

    monkeypatch.setattr(ai, "_default_image_generation_model", image_model)
    monkeypatch.setattr(ai, "_check_model_access", allow)

    payload = SimpleChatRequest(
        model="openai/gpt-5.4",
        messages=[{"role": "user", "content": "Создай изображение уютного дома"}],
        preferred_image_model="preferred/image",
    )
    user = UserDB(id=7, email="tools@example.com", subscription_tier="ULTRA")

    model, tool = await ai._resolve_simple_chat_route(payload, user)

    assert model == "google/gemini-3.1-flash-lite-image"
    assert tool == "image_generation"
