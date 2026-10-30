#!/usr/bin/env bash
# Usage: ./scripts/build-look-assets.sh /path/to/christian-2026-10-30
# ImageMagick only; source artwork is read-only. Run from web/.
set -euo pipefail
source_dir=${1:?"Supply the folder containing Christian's original logo and wordmark"}
output_dir=public/images/brand
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT
magick "$source_dir/christian-wordmark-distressed.png" -trim +repage "$scratch_dir/wordmark.png"
magick "$scratch_dir/wordmark.png" -fill '#491e0b' -colorize 100 "$scratch_dir/ink.png"
for size in 360 720 1440; do
  magick "$scratch_dir/wordmark.png" -resize "${size}x" -quality 90 "$output_dir/wordmark-cream-$size.webp"
  magick "$scratch_dir/ink.png" -resize "${size}x" -quality 90 "$output_dir/wordmark-ink-$size.webp"
done
# Remove JPEG black and its compressed edge pixels, including the letter counters.
# A one-pixel inset removes contaminated edges before a subpixel alpha feather.
magick "$source_dir/christian-logo-on-black.jpeg" -colorspace gray -threshold 6% -morphology Erode Diamond:1 -blur 0x0.4 "$scratch_dir/alpha.png"
magick "$source_dir/christian-logo-on-black.jpeg" "$scratch_dir/alpha.png" -alpha off -compose CopyOpacity -composite -trim +repage -resize 1200x "$output_dir/logo-preview-1200.png"
magick "$output_dir/logo-preview-1200.png" -quality 92 "$output_dir/logo-preview-1200.webp"
