#!/usr/bin/env bash
# Render docs/architecture.svg -> docs/architecture.png using whatever SVG
# converter is available. Run from the repo root:  bash scripts/gen-architecture-png.sh
set -euo pipefail

SVG="docs/architecture.svg"
PNG="docs/architecture.png"
W=1680   # output width in px (height scales automatically)

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w "$W" "$SVG" -o "$PNG"
elif command -v inkscape >/dev/null 2>&1; then
  inkscape "$SVG" --export-type=png --export-filename="$PNG" -w "$W"
elif command -v magick >/dev/null 2>&1; then
  magick -density 160 -background white "$SVG" "$PNG"
elif command -v convert >/dev/null 2>&1; then
  convert -density 160 -background white "$SVG" "$PNG"
else
  echo "No SVG→PNG converter found. Install one of:"
  echo "  sudo apt-get install -y librsvg2-bin     # rsvg-convert (best quality, recommended)"
  echo "  sudo apt-get install -y imagemagick      # provides 'convert'"
  echo "  sudo apt-get install -y inkscape"
  exit 1
fi

echo "✓ Wrote $PNG"
