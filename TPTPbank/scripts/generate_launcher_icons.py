"""Generate TPTPbank Android launcher assets from Stitch logos."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\DHSPKT\Hoc_ky_5\indoor-navigation-app")
SRC_PRIMARY = ROOT / (
    "stitch_indoornav_premium_landing_page/logoapbank/"
    "stitch_indoornav_premium_landing_page/tptpbank_app_icon/screen.png"
)
SRC_MONO = ROOT / (
    "stitch_indoornav_premium_landing_page/logoapbank/"
    "stitch_indoornav_premium_landing_page/tptpbank_monochrome_icon/screen.png"
)
RES = ROOT / "TPTPbank/app/src/main/res"
BG = (0x1D, 0x1D, 0x1F, 255)

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def square_rgba(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def fill_bleed(img: Image.Image, color=BG) -> Image.Image:
    img = square_rgba(img)
    out = Image.new("RGBA", img.size, color)
    out.paste(img, (0, 0), img)
    return out


def adaptive_foreground(primary: Image.Image, size: int = 432) -> Image.Image:
    return fill_bleed(primary, BG).resize((size, size), Image.Resampling.LANCZOS)


def adaptive_monochrome(mono: Image.Image, size: int = 432) -> Image.Image:
    mono = square_rgba(mono)
    mono = mono.resize((int(size * 0.66), int(size * 0.66)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - mono.size[0]) // 2
    oy = (size - mono.size[1]) // 2
    canvas.paste(mono, (ox, oy), mono)
    return canvas


def save_webp(img: Image.Image, path: Path, size: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = img.convert("RGBA")
    if size:
        out = out.resize((size, size), Image.Resampling.LANCZOS)
    out.save(path, "WEBP", quality=95, method=6)
    print("wrote", path.relative_to(ROOT), out.size)


def main() -> None:
    primary = Image.open(SRC_PRIMARY)
    mono = Image.open(SRC_MONO)
    print("primary", primary.size, "mono", mono.size)

    legacy = fill_bleed(primary, BG)
    for density, px in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        save_webp(legacy, folder / "ic_launcher.webp", px)
        save_webp(legacy, folder / "ic_launcher_round.webp", px)

    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    save_webp(adaptive_foreground(primary, 432), drawable / "ic_launcher_foreground.webp")
    save_webp(adaptive_monochrome(mono, 432), drawable / "ic_launcher_monochrome.webp")
    print("done")


if __name__ == "__main__":
    main()
