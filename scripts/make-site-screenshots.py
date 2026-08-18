#!/usr/bin/env python3
"""Turn raw phone screenshots into the marketing site's images.

    python3 scripts/make-site-screenshots.py [src folder]

The site had shots from 13 July still on it — a build before the Sky palette,
with a layout that no longer exists. These come straight off the device, so
there's no store caption or frame to crop out; they're only resized.

Sized for retina: the site renders .phone at 250px, so 540 wide is a little
over 2x. The originals are ~1179 wide and far too heavy to ship.

Picking shots for a PUBLIC page has one rule the App Store set doesn't:
no other people. The leaderboard screenshot is excluded for exactly that
reason — it shows real students' usernames and a real class name.
"""

import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                         else '~/Downloads/Prova build 12 app store photos')
OUT = os.path.join(ROOT, 'web/img')
WIDTH = 540

# (source, output name, what it shows)
SHOTS = [
    ('IMG_7207.jpg', 'shot-today.png',  "the day's plan"),
    ('IMG_7214.jpg', 'shot-notes.png',  'notes from a teacher'),
    ('IMG_7213.jpg', 'shot-chords.png', 'the chord library'),
]


# Where to cut so the home indicator goes. Detected rather than hardcoded: the
# sources were hand-cropped to different heights, so a fixed offset would clip
# the tab bar on one and leave a sliver of the pill on another. Returns the row
# to crop at, or None if no bar is found (already trimmed, or not an iPhone).
def home_indicator_top(im):
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    xs = range(w // 3, 2 * w // 3, 4)      # middle third only — the pill is centred
    rows = [y for y in range(h - 1, int(h * 0.88), -1)
            if sum(1 for x in xs if px[x, y] > 170) / len(xs) > 0.85]
    if not rows:
        return None
    return max(0, min(rows) - 4)           # a few px of clearance above the pill


def main():
    if not os.path.isdir(SRC):
        print(f'No such folder: {SRC}')
        raise SystemExit(1)

    found = [(s, o, w) for s, o, w in SHOTS if os.path.exists(os.path.join(SRC, s))]
    for s, _, _ in SHOTS:
        if not os.path.exists(os.path.join(SRC, s)):
            print(f'  missing: {s} — skipped')
    if not found:
        raise SystemExit(1)

    # Two trims, both from the bottom.
    #
    # First the iOS home indicator — the white pill under the tab bar. It reads
    # as a stray white line once the screenshot is on a web page, away from the
    # phone that explains it.
    #
    # Then, because the sources were cropped by hand and differ by about 1% in
    # height, they're squared up to a common size so the row lines up exactly.
    # By PADDING the short ones, not cropping the tall ones: levelling down cut
    # into the tab bar and clipped its labels. The padding is sampled from each
    # image's own bottom edge — the tab bar is a flat colour there, so the join
    # is invisible.
    scaled = []
    for src_name, out_name, what in found:
        im = Image.open(os.path.join(SRC, src_name)).convert('RGB')
        cut = home_indicator_top(im)
        if cut is not None:
            im = im.crop((0, 0, im.width, cut))
        h = round(im.height * (WIDTH / im.width))
        scaled.append((im.resize((WIDTH, h), Image.LANCZOS), out_name, what))
    height = max(im.height for im, _, _ in scaled)

    for im, out_name, what in scaled:
        pad = height - im.height
        if pad > 0:
            # Median of the bottom row, so one stray bright pixel can't pick it.
            row = [im.getpixel((x, im.height - 1)) for x in range(0, WIDTH, 3)]
            fill = tuple(sorted(c[i] for c in row)[len(row) // 2] for i in range(3))
            canvas = Image.new('RGB', (WIDTH, height), fill)
            canvas.paste(im, (0, 0))
            im = canvas
        dest = os.path.join(OUT, out_name)
        im.save(dest, optimize=True)
        kb = os.path.getsize(dest) // 1024
        print(f'  {out_name:18} {WIDTH}x{height}  {kb} KB  pad {pad}px  ({what})')

    print(f'\n{len(scaled)} images at {WIDTH}x{height} -> {OUT}')


if __name__ == '__main__':
    main()
