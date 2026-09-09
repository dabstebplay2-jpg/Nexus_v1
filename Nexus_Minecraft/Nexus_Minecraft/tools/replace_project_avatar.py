from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICON_DIR = ASSETS / "icons"
WEB_ASSETS = ROOT / "website" / "assets"


def _require_pillow():
    try:
        from PIL import Image, ImageChops
        return Image, ImageChops
    except ImportError as exc:
        raise SystemExit(
            "Pillow (PIL) is required for this dev tool.\n"
            "Install: pip install Pillow"
        ) from exc


def crop_and_square(image):
    Image, ImageChops = _require_pillow()
    image = image.convert("RGBA")
    bg = Image.new("RGBA", image.size, (255, 255, 255, 255))
    diff = ImageChops.difference(image, bg)
    bbox = diff.getbbox()

    if bbox:
        x1, y1, x2, y2 = bbox
        margin = int(max(x2 - x1, y2 - y1) * 0.04)
        image = image.crop((
            max(0, x1 - margin),
            max(0, y1 - margin),
            min(image.width, x2 + margin),
            min(image.height, y2 + margin),
        ))

    side = max(image.width, image.height)
    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python tools/replace_project_avatar.py path/to/avatar.png")
        return 2

    Image, _ = _require_pillow()

    source = Path(sys.argv[1]).expanduser().resolve()
    if not source.exists():
        print(f"File not found: {source}")
        return 1

    ASSETS.mkdir(exist_ok=True)
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    WEB_ASSETS.mkdir(parents=True, exist_ok=True)

    image = crop_and_square(Image.open(source))

    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(ASSETS / "nexus.png")
    image.resize((512, 512), Image.Resampling.LANCZOS).save(ICON_DIR / "nexus.png")
    image.resize((512, 512), Image.Resampling.LANCZOS).save(WEB_ASSETS / "logo.png")
    image.resize((256, 256), Image.Resampling.LANCZOS).save(WEB_ASSETS / "favicon.png")
    image.resize((1200, 1200), Image.Resampling.LANCZOS).save(WEB_ASSETS / "og-cover.png")

    icon = image.resize((256, 256), Image.Resampling.LANCZOS)
    icon.save(
        ASSETS / "nexus.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print("Avatar updated:")
    print(f"- {ASSETS / 'nexus.ico'}")
    print(f"- {ICON_DIR / 'nexus.png'}")
    print(f"- {WEB_ASSETS / 'logo.png'}")
    print(f"- {WEB_ASSETS / 'favicon.png'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
