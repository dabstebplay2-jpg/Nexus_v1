from app.vision_capabilities import apply_vision_metadata, compute_vision_tier


def test_vision_tier_excellent():
    m = apply_vision_metadata(
        {
            "id": "google/gemini-3.5-flash",
            "supports_vision": True,
            "multimodal": True,
        }
    )
    assert m["vision_tier"] == "excellent"
    assert m["accepts_photo_analysis"] is True


def test_vision_tier_none_deepseek():
    m = apply_vision_metadata(
        {
            "id": "deepseek/deepseek-v4-flash",
            "supports_vision": False,
            "multimodal": False,
        }
    )
    assert m["vision_tier"] == "none"
    assert m["accepts_photo_analysis"] is False


def test_vision_tier_image_gen():
    m = apply_vision_metadata(
        {
            "id": "black-forest-labs/flux.2-pro",
            "category": "media",
            "supports_image_gen": True,
            "supports_vision": False,
        }
    )
    assert compute_vision_tier(m) == "image_gen"
