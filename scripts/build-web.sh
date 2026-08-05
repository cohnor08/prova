#!/usr/bin/env bash
# Build the web app into web/app/, ready for `firebase deploy --only hosting`.
#
# Run this instead of calling `expo export` by hand. Two things about the web
# build are easy to get wrong and both have shipped broken before:
#
#   1. Expo regenerates index.html on every export with NO background colour,
#      so the page is browser-white until the JS bundle boots — a white flash
#      over the intro animation. The colour has to be in the HTML itself;
#      setting it from App.js runs too late. This script re-injects it.
#
#   2. Hosting's default ignore drops **/node_modules/**, and the exported
#      vector-icon fonts live under assets/node_modules/@expo/vector-icons/...
#      If firebase.json's `ignore` is ever widened again, icons render as
#      squares. This script fails loudly if the fonts didn't make it.
#
# Keep PAGE_BG in step with the `body{background:...}` rule in App.js.
set -euo pipefail
cd "$(dirname "$0")/.."

PAGE_BG="#101318"

echo "→ exporting web bundle"
rm -rf dist
npx expo export --platform web

echo "→ injecting page background ($PAGE_BG)"
python3 - "$PAGE_BG" <<'PY'
import sys, pathlib
bg = sys.argv[1]
p = pathlib.Path("dist/index.html")
html = p.read_text()
rule = f"<style>html,body{{background:{bg}}}</style>"
if rule in html:
    raise SystemExit("background already present — nothing to do")
if "</head>" not in html:
    raise SystemExit("ERROR: no </head> in the exported index.html")
p.write_text(html.replace("</head>", f"  {rule}\n</head>", 1))
print("   injected")
PY

echo "→ swapping into web/app"
rm -rf web/app && mkdir -p web/app && cp -R dist/* web/app/
rm -rf dist

FONTS="web/app/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts"
count=$(ls "$FONTS" 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -lt 10 ]; then
  echo "✗ only $count icon fonts exported — icons would render as squares" >&2
  exit 1
fi

echo "✓ web/app ready ($count icon fonts) — now: npx firebase-tools deploy --only hosting"
