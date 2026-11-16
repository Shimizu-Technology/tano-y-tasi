// The picture the puzzle home cuts up: Christian's Guåhan map. The edge preload
// (netlify/lib/storefront.ts) and the rendered image both read these, so the browser reuses the
// preloaded candidate.
const base = "/images/products/guahan-sunset-map/artwork";
// The files are named by height; the descriptors are their real widths.
export const PUZZLE_ART = {
  src: `${base}-1280.webp`,
  srcSet: `${base}-640.webp 509w, ${base}-1280.webp 1017w, ${base}-2000.webp 1590w`,
  sizes: "(min-width: 900px) 44vw, calc(100vw - 32px)",
  width: 509,
  height: 640,
  alt: "Illustrated map of Guåhan in sunset colors, showing villages and coastal landmarks.",
} as const;
