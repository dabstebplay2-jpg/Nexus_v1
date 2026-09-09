from app.services.chat_history import messages_from_json, messages_to_json


def test_messages_roundtrip_preserves_images():
    messages = [
        {
            "role": "assistant",
            "content": "Изображение готово.",
            "images": [{"dataUrl": "data:image/png;base64,abc", "artifactId": "art_1"}],
        }
    ]
    raw = messages_to_json(messages)
    restored = messages_from_json(raw)
    assert restored[0]["images"][0]["artifactId"] == "art_1"
    assert restored[0]["images"][0]["dataUrl"].startswith("data:")
