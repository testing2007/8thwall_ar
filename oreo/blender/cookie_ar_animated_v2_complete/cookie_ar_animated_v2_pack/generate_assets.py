from __future__ import annotations

from pathlib import Path
from shutil import copy2

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
V1_ASSETS = ROOT.parent / "ar_pack" / "assets"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, start_size: int, bold: bool = True):
    size = start_size
    while size > 20:
        selected = font(size, bold)
        box = draw.textbbox((0, 0), text, font=selected)
        if box[2] - box[0] <= max_width:
            return selected
        size -= 2
    return font(size, bold)


def title_card() -> Image.Image:
    image = Image.new("RGBA", (1024, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cyan = (116, 229, 255, 255)
    pale = (220, 249, 255, 255)
    text_font = fit_text(draw, "HOW TO ENJOY", 880, 112)
    draw.text((64, 38), "HOW TO ENJOY", font=text_font, fill=pale)
    draw.rounded_rectangle((64, 194, 960, 207), radius=6, fill=cyan)
    draw.ellipse((909, 171, 961, 223), outline=pale, width=6)
    return image


def step_card(number: str, label: str, detail: str) -> Image.Image:
    image = Image.new("RGBA", (1024, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cyan = (91, 218, 255, 255)
    pale = (222, 250, 255, 255)
    soft = (138, 219, 241, 230)
    draw.rounded_rectangle((45, 33, 202, 190), radius=36, outline=cyan, width=10)
    draw.text((79, 53), number, font=font(76, True), fill=pale)
    draw.text((265, 35), label, font=fit_text(draw, label, 680, 78), fill=pale)
    draw.text((268, 126), detail, font=fit_text(draw, detail, 680, 35, False), fill=soft)
    draw.rounded_rectangle((265, 188, 950, 198), radius=5, fill=cyan)
    return image


def status_badge() -> Image.Image:
    image = Image.new("RGBA", (512, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cyan = (90, 221, 255, 255)
    pale = (226, 250, 255, 255)
    draw.rounded_rectangle((14, 18, 498, 174), radius=44, outline=cyan, width=8, fill=(14, 83, 132, 90))
    draw.ellipse((40, 51, 130, 141), outline=pale, width=8)
    draw.arc((58, 27, 112, 103), start=190, end=350, fill=pale, width=8)
    draw.text((158, 48), "READY", font=font(64, True), fill=pale)
    return image


def sparkle() -> Image.Image:
    image = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for radius, alpha in [(54, 20), (38, 45), (23, 105), (10, 255)]:
        color = (126, 230, 255, alpha)
        draw.ellipse((64 - radius, 64 - radius, 64 + radius, 64 + radius), fill=color)
    draw.polygon([(64, 2), (72, 55), (126, 64), (72, 73), (64, 126), (56, 73), (2, 64), (56, 55)], fill=(230, 252, 255, 235))
    return image


def scan_strip() -> Image.Image:
    width, height = 512, 128
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    centre = (height - 1) / 2
    for y in range(height):
        distance = abs(y - centre) / centre
        alpha = int(max(0.0, 1.0 - distance) ** 2.6 * 210)
        draw.line((0, y, width, y), fill=(105, 225, 255, alpha))
    draw.rectangle((0, height // 2 - 2, width, height // 2 + 2), fill=(225, 252, 255, 245))
    return image


def prepare_cookie_maps() -> None:
    albedo = Image.open(V1_ASSETS / "cookie_albedo_1024.png").convert("RGBA")
    normal = Image.open(V1_ASSETS / "cookie_normal_1024.png").convert("RGB")
    bbox = albedo.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Cookie albedo has no visible pixels")
    left, top, right, bottom = bbox
    centre_x = (left + right) // 2
    centre_y = (top + bottom) // 2
    side = max(right - left, bottom - top) + 20
    crop = (
        max(0, centre_x - side // 2),
        max(0, centre_y - side // 2),
        min(albedo.width, centre_x + side // 2),
        min(albedo.height, centre_y + side // 2),
    )
    albedo.crop(crop).resize((1024, 1024), Image.Resampling.LANCZOS).save(
        ASSETS / "cookie_albedo_1024.png", optimize=True
    )
    normal.crop(crop).resize((1024, 1024), Image.Resampling.LANCZOS).save(
        ASSETS / "cookie_normal_1024.png", optimize=True
    )


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    required = [
        "front_glow_mask_1024x2048.png",
        "image_target_front_1024x2048.jpg",
    ]
    for name in required:
        copy2(V1_ASSETS / name, ASSETS / name)

    prepare_cookie_maps()

    title_card().save(ASSETS / "panel_title_1024x256.png", optimize=True)
    step_card("01", "TWIST", "Rotate the sandwich gently").save(ASSETS / "panel_step_01_1024x256.png", optimize=True)
    step_card("02", "TASTE", "Reveal the layered centre").save(ASSETS / "panel_step_02_1024x256.png", optimize=True)
    step_card("03", "SHARE", "Enjoy the final stack").save(ASSETS / "panel_step_03_1024x256.png", optimize=True)
    status_badge().save(ASSETS / "panel_status_512x256.png", optimize=True)
    sparkle().save(ASSETS / "sparkle_128.png", optimize=True)
    scan_strip().save(ASSETS / "scan_strip_512x128.png", optimize=True)

    print(f"Prepared {len(list(ASSETS.iterdir()))} assets in {ASSETS}")


if __name__ == "__main__":
    main()
