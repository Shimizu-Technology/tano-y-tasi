import type { Art, DropSummary, ProductDetail, DropState } from "../types";
const art = (slug: string, file: string, widths: number[], aspect: string, alt: string, role = "gallery"): Art => ({
  base: `/images/products/${slug}/${file}`,
  widths,
  aspect,
  alt,
  role,
});
export const CORE = "hafa-adai-from-tumon-bay";
export const MAP = "guahan-sunset-map";
export const DROP = "drop-001-guahan-sunset-map";
export function dropSummary(state: DropState): DropSummary {
  return {
    slug: DROP,
    number: 1,
    name: "Guåhan Sunset Map",
    state,
    release_at: "2026-12-05T00:00:00Z",
    closes_at: state === "closed" ? "2026-12-06T00:00:00Z" : null,
    sold_out_at: state === "sold_out" ? "2026-12-05T02:00:00Z" : null,
    quantity: 100,
    per_customer_limit: 2,
  };
}
const coreImages = [
  art(
    CORE,
    "finished-square",
    [640, 1280, 2000],
    "1:1",
    "Puzzle of the colorful GUAM letter sign on the sand at Tumon Bay.",
    "hero"
  ),
  art(CORE, "box-front", [640, 952], "640:538", "Tåno + Tåsi keepsake puzzle box featuring the GUAM sign.", "box"),
  art(
    CORE,
    "finished-tabletop",
    [640, 1280, 2000],
    "3:4",
    "Finished Tumon Bay puzzle on a table beside flowers.",
    "lifestyle"
  ),
  art(
    CORE,
    "piece-detail",
    [640, 1071],
    "4:3",
    "Close-up of the cut and printed pieces of the Tumon Bay puzzle.",
    "detail"
  ),
  art(
    CORE,
    "finished-landscape",
    [1280, 2000, 2800],
    "4:3",
    "The complete Tumon Bay puzzle showing the GUAM sign and blue ocean."
  ),
];
const mapImages = [
  art(
    MAP,
    "artwork",
    [640, 1280, 2000, 2800],
    "509:640",
    "Illustrated sunset map of Guåhan, its villages, landmarks, and surrounding sea.",
    "hero"
  ),
  art(
    MAP,
    "detail-two-lovers-point",
    [640, 1280, 2000],
    "4:3",
    "Illustration detail of Two Lovers Point and northern Guåhan.",
    "detail"
  ),
  art(
    MAP,
    "detail-humatak",
    [640, 1280, 2000],
    "4:3",
    "Illustration detail of Humåtak and the southern villages.",
    "detail"
  ),
  art(
    MAP,
    "detail-koko",
    [640, 1280, 2000],
    "4:3",
    "Illustration detail of the ko’ko’ bird and tropical flowers.",
    "detail"
  ),
];
export function catalog(state: DropState, stock: Record<string, number>): ProductDetail[] {
  const make = (slug: string, name: string, kind: "core" | "drop", price: number, images: Art[]): ProductDetail => {
    const count = stock[slug] ?? 0;
    const available = kind === "core" ? count > 0 : state === "live" && count > 0;
    const availabilityState = kind === "drop" && state !== "live" ? state : count === 0 ? "sold_out" : "available";
    return {
      slug,
      name,
      kind,
      price_cents: price,
      currency: "USD",
      summary:
        kind === "core"
          ? "The GUAM sign at Tumon Bay, 100 pieces."
          : "An illustrated journey through the villages and shores of Guåhan.",
      description:
        kind === "core"
          ? "A familiar view of Tumon Bay, made to piece together wherever you call home."
          : "From Ritidian to Cocos Island, a sunset journey through the island we carry with us.",
      availability: {
        state: availabilityState,
        purchasable: available,
        remaining: count <= 20 ? count : null,
        low_stock: count > 0 && count <= 20,
      },
      drop: kind === "drop" ? dropSummary(state) : null,
      image: images[0],
      images,
      specs: {
        piece_count: kind === "core" ? 100 : 500,
        finished_size: kind === "core" ? "12 × 9 in" : "16 × 20 in",
        box_size: "To be confirmed",
        material: "To be confirmed",
        cut: "Classic",
        made_in: kind === "core" ? "USA" : "To be confirmed",
      },
      includes: [`${kind === "core" ? 100 : 500}-piece puzzle`, "Keepsake box"],
      art: {
        credit: kind === "core" ? "Photo: Christian Tenorio (to confirm)" : "Illustration credit to be confirmed",
        story:
          kind === "core"
            ? "The colorful GUAM sign, blue water, and open sky of Tumon Bay."
            : "A richly illustrated map celebrating Guåhan’s villages, land, and sea.",
      },
      per_customer_limit: kind === "drop" ? 2 : null,
      max_per_order: available ? Math.min(kind === "core" ? 10 : 2, count) : 0,
      placeholders:
        kind === "core"
          ? ["price_cents", "specs.box_size", "specs.material", "art.credit"]
          : [
              "price_cents",
              "specs.piece_count",
              "specs.finished_size",
              "specs.box_size",
              "specs.material",
              "specs.made_in",
              "art.credit",
            ],
    };
  };
  return [
    make(CORE, "Håfa Adai from Tumon Bay", "core", 3500, coreImages),
    make(MAP, "Guåhan Sunset Map", "drop", 4500, mapImages),
  ];
}
