import pytest
from fastapi import HTTPException

from app.schemas import ChatAttachment, ChatMessage, SimpleChatRequest
from app.services.message_builder import (
    assert_model_accepts_images,
    build_router_messages,
    build_user_content,
    extract_message_images,
    router_modalities_for_model,
)


def test_build_user_content_text_only():
    assert build_user_content("Привет", []) == "Привет"


def test_build_user_content_with_image():
    att = ChatAttachment(
        kind="image",
        name="a.png",
        mime="image/png",
        data_base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    )
    parts = build_user_content("Что на фото?", [att])
    assert isinstance(parts, list)
    assert parts[0]["type"] == "text"
    assert parts[1]["type"] == "image_url"
    assert parts[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_build_user_content_with_file():
    att = ChatAttachment(kind="file", name="note.txt", mime="text/plain", text="hello")
    content = build_user_content("", [att])
    text = content if isinstance(content, str) else content[0]["text"]
    assert "note.txt" in text
    assert "hello" in text


def test_build_router_messages_merges_attachments():
    req = SimpleChatRequest(
        model="google/gemini-3.5-flash",
        messages=[ChatMessage(role="user", content="Опиши")],
        attachments=[
            ChatAttachment(
                kind="image",
                name="x.png",
                mime="image/png",
                data_base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            )
        ],
    )
    msgs = build_router_messages(req.messages, req.attachments)
    assert isinstance(msgs[-1]["content"], list)


def test_extract_message_images():
    imgs = extract_message_images(
        {
            "images": [
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}}
            ]
        }
    )
    assert imgs == [{"url": "data:image/png;base64,abc"}]


def test_assert_model_rejects_images_without_vision(monkeypatch):
    monkeypatch.setattr(
        "app.services.message_builder.reg.get_model",
        lambda _id: {"supports_vision": False, "multimodal": False, "accepts_photo_analysis": False},
    )
    att = ChatAttachment(
        kind="image",
        name="a.png",
        mime="image/png",
        data_base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    )
    with pytest.raises(HTTPException) as exc:
        assert_model_accepts_images("deepseek/deepseek-v4-flash", [att])
    assert exc.value.status_code == 400


def test_router_modalities_media(monkeypatch):
    monkeypatch.setattr(
        "app.services.message_builder.reg.get_model",
        lambda _id: {
            "category": "media",
            "supports_image_gen": True,
            "output_modalities": ["image", "text"],
        },
    )
    assert router_modalities_for_model("google/gemini-3.1-flash-image-preview") == [
        "image",
        "text",
    ]
