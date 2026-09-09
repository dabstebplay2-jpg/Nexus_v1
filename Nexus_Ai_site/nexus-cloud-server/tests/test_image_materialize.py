import pytest

from app.services import image_materialize as im


@pytest.mark.asyncio
async def test_materialize_image_url_data_passthrough():
    data = "data:image/png;base64,abc"
    out = await im.materialize_image_url(data)
    assert out["dataUrl"] == data
    assert out["url"] == data


@pytest.mark.asyncio
async def test_materialize_image_url_http(monkeypatch):
    class FakeResp:
        status_code = 200
        headers = {"content-type": "image/png"}

        @property
        def content(self):
            return b"\x89PNG\r\n\x1a\n"

        def raise_for_status(self):
            pass

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url):
            assert url == "https://example.com/img.png"
            return FakeResp()

    monkeypatch.setattr(im.httpx, "AsyncClient", lambda **kw: FakeClient())

    out = await im.materialize_image_url("https://example.com/img.png")
    assert out["url"].startswith("data:image/png;base64,")
    assert out["dataUrl"] == out["url"]


def test_as_data_url_compresses_large_png():
    # 1x1 PNG expanded to fake large payload triggers compress path
    from PIL import Image

    img = Image.new("RGB", (2400, 2400), color=(120, 80, 200))
    buf = __import__("io").BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    url = im._as_data_url(data, "image/png")
    assert url.startswith("data:image/jpeg;base64,")
    assert len(url) < 800_000
