#!/usr/bin/env python3
"""Build the 1200x630 social share card at web/img/og-cover.png.

This is the image Google, iMessage, Slack and every social site show when
someone shares a Prova link. Rebuild it whenever the screenshots or the
tagline change:

    python3 scripts/make-og-image.py

Source screenshot is one of the App Store shots (1290x2796, caption baked
into the top) — we crop the phone out from under the caption.
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (12, 17, 28)
BG_BOT = (5, 8, 16)
BLUE = (58, 129, 246)
WHITE = (244, 246, 250)
GREY = (138, 148, 168)
BORDER = (23, 48, 94)

BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
REG = '/System/Library/Fonts/Supplemental/Arial.ttf'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT = os.path.expanduser(
    '~/Desktop/Prova App Store screenshots 1.0.2/01-prova.png')
OUT = os.path.join(ROOT, 'web/img/og-cover.png')

# The phone frame inside a store screenshot, measured off 01-prova.png.
PHONE_BOX = (115, 400, 1175, 2680)


def vertical_gradient(size, top, bottom):
    w, h = size
    grad = Image.new('RGB', (1, h))
    px = grad.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return grad.resize((w, h), Image.BICUBIC)


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [(0, 0), (img.size[0] - 1, img.size[1] - 1)], radius, fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def main():
    card = vertical_gradient((W, H), BG_TOP, BG_BOT)
    draw = ImageDraw.Draw(card)

    # ---- right side: the phone, cropped out from under its caption -------
    if os.path.exists(SHOT):
        phone = Image.open(SHOT).convert('RGB').crop(PHONE_BOX)
        # Show the top of the screen only; it gets cropped by the card edge.
        target_w = 340
        scale = target_w / phone.width
        phone = phone.resize(
            (target_w, round(phone.height * scale)), Image.LANCZOS)
        phone = phone.crop((0, 0, target_w, min(phone.height, 470)))
        phone = rounded(phone, 26)

        # A soft blue glow behind it, so it reads as lit rather than pasted.
        glow = Image.new('RGBA', (target_w + 80, phone.height + 80), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle(
            [(40, 40), (target_w + 39, phone.height + 39)], 30,
            fill=(58, 129, 246, 46))
        from PIL import ImageFilter
        glow = glow.filter(ImageFilter.GaussianBlur(28))

        px, py = 762, 96
        card.paste(glow, (px - 40, py - 40), glow)
        card.paste(phone, (px, py), phone)
        draw.rounded_rectangle(
            [(px, py), (px + target_w - 1, py + phone.height - 1)],
            26, outline=BORDER, width=2)

    # ---- left side: icon, wordmark, headline, tagline --------------------
    x = 76
    y = 128

    icon_path = os.path.join(ROOT, 'web/img/icon-192.png')
    if os.path.exists(icon_path):
        icon = rounded(Image.open(icon_path).convert('RGB')
                       .resize((76, 76), Image.LANCZOS), 18)
        card.paste(icon, (x, y), icon)

    draw.text((x + 96, y + 22), 'P R O V A',
              font=ImageFont.truetype(BOLD, 27), fill=WHITE)

    y += 126
    f_h1 = ImageFont.truetype(BOLD, 62)
    draw.text((x, y), 'Practice', font=f_h1, fill=WHITE)
    y += 74
    draw.text((x, y), '& Progress', font=f_h1, fill=BLUE)

    y += 100
    draw.rounded_rectangle([(x, y), (x + 106, y + 8)], 4, fill=BLUE)

    y += 40
    f_sub = ImageFont.truetype(REG, 27)
    for line in ('AI practice coach for guitar',
                 'and bass — and their teachers.'):
        draw.text((x, y), line, font=f_sub, fill=GREY)
        y += 38

    y += 26
    draw.text((x, y), 'Free on the App Store',
              font=ImageFont.truetype(BOLD, 22), fill=BLUE)

    card.save(OUT, optimize=True)
    print(f'wrote {OUT}  ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
