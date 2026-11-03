import type { Art } from "./types";

// The home hero photo. The edge preload (netlify/lib/storefront.ts) and the rendered image
// both read these, so the browser reuses the preloaded candidate. It never depends on a drop.
export const HOME_HERO_ART: Art = {
  base: "/images/products/hafa-adai-from-tumon-bay/finished-tabletop",
  widths: [640, 1280, 2000],
  aspect: "3:4",
  role: "lifestyle",
  alt: "Finished Tumon Bay puzzle on a table with flowers and its keepsake box.",
};
export const HOME_HERO_SIZES = "(min-width: 900px) 52vw, 100vw";
