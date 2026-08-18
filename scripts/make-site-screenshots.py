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


def main():
    if not os.path.isdir(SRC):
        print(f'No such folder: {SRC}')
        raise SystemExit(1)

    for src_name, out_name, what in SHOTS:
        path = os.path.join(SRC, src_name)
        if not os.path.exists(path):
            print(f'  missing: {src_name} — skipped')
            continue
        im = Image.open(path).convert('RGB')
        h = round(im.height * (WIDTH / im.width))
        im = im.resize((WIDTH, h), Image.LANCZOS)
        dest = os.path.join(OUT, out_name)
        im.save(dest, optimize=True)
        kb = os.path.getsize(dest) // 1024
        print(f'  {out_name:18} {WIDTH}x{h}  {kb} KB   ({what})')

    print(f'\n{len(SHOTS)} images -> {OUT}')


if __name__ == '__main__':
    main()
