#!/usr/bin/env python3
"""Compose App Store screenshots in the existing Prova listing style.

Geometry was measured off the live listing (old_0.png, 1287x2796 as served)
and scaled to the real 1290x2796 canvas, so the new set drops in beside the
old ones without a visible change of template:

    background   #050810 flat, with a soft blue glow behind the caption
    caption      bold white, centred, cap-height ~62px
    rule         106x8 #3A81F6, centred, under the caption
    device       1064 wide, top at y=347, 2px #17305E border, rounded

The phone shots are cropped to slightly different heights, so each is scaled
to the frame width and centred in the space below the caption rather than
pinned to a fixed bottom — a fixed bottom would letterbox them unevenly.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import sys

W, H = 1290, 2796
BG = (5, 8, 16)
RULE = (58, 129, 246)
BORDER = (23, 48, 94)
FRAME_W = 1064
FRAME_TOP = 347
FRAME_BOTTOM_MAX = 2660
RADIUS = 52
CAP_TOP, CAP_BOT = 142, 204          # cap-height band of the caption
RULE_Y, RULE_W, RULE_H = 250, 106, 8

FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
# Point SRC at a folder of raw phone screenshots and re-run; the filenames in
# SHOTS below need to match. Both are overridable:
#   python3 scripts/make-store-screenshots.py <src folder> <out folder>
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads/Prova build 12 app store photos')
OUT = os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/Desktop/Prova App Store screenshots')

# (source file, caption) — ordered for the listing; the first two carry it.
# Kept short on purpose: every caption has to render at the same cap-height as
# the existing listing, and a long line shrinks to fit, which makes the set look
# uneven when you swipe through it.
SHOTS = [
    ('IMG_7207.jpg', 'Planned for you daily'),
    ('IMG_7212.jpg', 'Climb the leaderboard'),
    ('IMG_7208.jpg', 'Drills, games and theory'),
    ('IMG_7214.jpg', 'Notes from your teacher'),
    ('IMG_7211.jpg', 'Lessons and gigs'),
    ('IMG_7210.jpg', 'Stay in time'),
    ('IMG_7213.jpg', 'Chords and scales'),
]


CAP_H = CAP_BOT - CAP_TOP            # 62px, measured off the live listing

def fit_font(text, max_w):
    """Match the original's cap-height, shrinking only if the line is too wide.

    Sizing to fill the width instead would make every caption a different size
    depending on how long it is, which reads as sloppy across a set of seven.
    """
    size = 40
    while size < 140:
        probe = ImageFont.truetype(FONT, size + 2)
        b = probe.getbbox('H')
        if (b[3] - b[1]) > CAP_H:
            break
        size += 2
    while size > 40:
        f = ImageFont.truetype(FONT, size)
        box = f.getbbox(text)
        if box[2] - box[0] <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(FONT, 40)


def glow(canvas):
    """Soft blue wash behind the caption — the flat bg alone reads as dead."""
    g = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(g)
    d.ellipse([W // 2 - 620, -560, W // 2 + 620, 700], fill=(14, 28, 54))
    g = g.filter(ImageFilter.GaussianBlur(190))
    return Image.blend(canvas, g, 0.85)


def rounded(img, r):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], r, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def build(src_name, caption, index):
    canvas = glow(Image.new('RGB', (W, H), BG))
    d = ImageDraw.Draw(canvas)

    font = fit_font(caption, W - 230)   # the original never crowded the edges
    box = font.getbbox(caption)
    # Align the cap-height band to the original, not the bounding box, so
    # captions with and without descenders sit on the same line.
    x = (W - (box[2] - box[0])) // 2 - box[0]
    d.text((x, CAP_TOP - box[1]), caption, font=font, fill=(255, 255, 255))
    d.rounded_rectangle(
        [W // 2 - RULE_W // 2, RULE_Y, W // 2 + RULE_W // 2, RULE_Y + RULE_H],
        RULE_H // 2, fill=RULE)

    shot = Image.open(os.path.join(SRC, src_name)).convert('RGB')
    scale = FRAME_W / shot.size[0]
    fh = min(int(shot.size[1] * scale), FRAME_BOTTOM_MAX - FRAME_TOP)
    shot = shot.resize((FRAME_W, fh), Image.LANCZOS)

    fx = (W - FRAME_W) // 2
    fy = FRAME_TOP + max(0, (FRAME_BOTTOM_MAX - FRAME_TOP - fh) // 2)
    canvas.paste(rounded(shot, RADIUS), (fx, fy), rounded(shot, RADIUS))
    d.rounded_rectangle([fx - 1, fy - 1, fx + FRAME_W, fy + fh], RADIUS + 1, outline=BORDER, width=3)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{index:02d}-prova.png')
    canvas.save(path)
    return path


if __name__ == '__main__':
    for i, (f, cap) in enumerate(SHOTS, 1):
        p = build(f, cap, i)
        print(f'  {os.path.basename(p)}  {cap}')
    print(f'\n{len(SHOTS)} screenshots at {W}x{H} -> {OUT}')
