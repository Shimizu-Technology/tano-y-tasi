#!/usr/bin/env bash
# Usage: ./scripts/build-brand-assets.sh /path/to/folder-with-christians-originals
# ImageMagick only; source artwork is read-only. Run from web/.
# Produces the header wordmark (wordmark-ink-*) and the emblem (logo-emblem-*) served by the storefront.
set -euo pipefail
source_dir=${1:?"Supply the folder containing Christian's original logo and wordmark"}
output_dir=public/images/brand
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT
# Distressed wordmark: trim the empty margins, then recolor to the brand ink.
magick "$source_dir/christian-wordmark-distressed.png" -trim +repage "$scratch_dir/wordmark.png"
magick "$scratch_dir/wordmark.png" -fill '#491e0b' -colorize 100 "$scratch_dir/ink.png"
for size in 360 720; do
  magick "$scratch_dir/ink.png" -resize "${size}x" -quality 90 "$output_dir/wordmark-ink-$size.webp"
done
# Emblem: remove JPEG black and its compressed edge pixels, including the letter counters.
# A one-pixel inset removes contaminated edges before a subpixel alpha feather.
magick "$source_dir/christian-logo-on-black.jpeg" -colorspace gray -threshold 6% -morphology Erode Diamond:1 -blur 0x0.4 "$scratch_dir/alpha.png"
magick "$source_dir/christian-logo-on-black.jpeg" "$scratch_dir/alpha.png" -alpha off -compose CopyOpacity -composite -trim +repage -resize 1200x "$scratch_dir/emblem.png"
# 240/480/960 wide cover the 112px footer through the 360px home emblem at 1x–3x.
magick "$scratch_dir/emblem.png" -resize 240x -quality 82 "$output_dir/logo-emblem-240.webp"
magick "$scratch_dir/emblem.png" -resize 480x -quality 88 "$output_dir/logo-emblem-480.webp"
magick "$scratch_dir/emblem.png" -resize 960x -quality 92 "$output_dir/logo-emblem-960.webp"
