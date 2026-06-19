#!/usr/bin/env bash
# Download the demo images ONCE into the frontend assets, so the feed / events /
# groups / avatars load locally (fast + stable) instead of hitting picsum /
# loremflickr / randomuser on every page load.
#
# Run from the repo root, then rebuild the frontend:
#   bash scripts/fetch-seed-images.sh
#   docker compose up -d --build frontend          # (or full reseed: down -v && up --build)
#
# The filenames/counts here MUST match the local paths written by
# backend/.../db/migration/V111__local_seed_images.sql.
set -euo pipefail

DEST="frontend/src/assets/seed"
mkdir -p "$DEST/portraits/men" "$DEST/portraits/women" "$DEST/posts" "$DEST/events" "$DEST/groups"

dl() {  # url  outfile
  if curl -fsSL "$1" -o "$2"; then echo "  ✓ $2"; else echo "  ✗ FAILED $1"; fi
}

echo "▸ Portraits (men 1..24)…"
for n in $(seq 1 24); do dl "https://randomuser.me/api/portraits/men/$n.jpg"   "$DEST/portraits/men/$n.jpg"; done
echo "▸ Portraits (women 1..20)…"
for n in $(seq 1 20); do dl "https://randomuser.me/api/portraits/women/$n.jpg" "$DEST/portraits/women/$n.jpg"; done

echo "▸ Post images (1..12)…"
for n in $(seq 1 12); do dl "https://picsum.photos/seed/ecpost$n/900/560"  "$DEST/posts/$n.jpg"; done

echo "▸ Event banners (1..12)…"
for n in $(seq 1 12); do dl "https://picsum.photos/seed/ecevent$n/1200/420" "$DEST/events/$n.jpg"; done

echo "▸ Group covers (topic-related, 1..12)…"
groups=( "artificial,intelligence" "data,science" "paris,city" "dubai,city" \
         "women,technology" "startup,office" "startup,team" "cybersecurity,security" \
         "graduation,university" "cloud,datacenter" "robotics,robot" "software,programming" )
i=1
for tags in "${groups[@]}"; do dl "https://loremflickr.com/1000/300/$tags" "$DEST/groups/$i.jpg"; i=$((i+1)); done

echo
echo "Done → $DEST"
echo "Next: docker compose up -d --build frontend   (image URLs are localised by migration V111)"
