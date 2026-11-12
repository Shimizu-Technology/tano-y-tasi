import type { Art, Box, DropSummary, ProductDetail, DropState } from "../types";
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
// Only in the catalog when asked for: ?mockPreorder=1 and ?mockDropItems=2 or 3.
export const PREORDER = "hagatna-sunrise";
export const PREORDER_SHIPS = "Ships late January 2027";
export const MAP_NIGHT = "guahan-night-map";
export const MAP_TIDES = "guahan-tide-map";
let salesOpen = true;
export function setMockSalesOpen(value: boolean) {
  salesOpen = value;
}
export const mockSalesOpen = () => salesOpen;
let announced = true;
export function setMockAnnounced(value: boolean) {
  announced = value;
}
export function dropSummary(state: DropState): DropSummary {
  return {
    slug: DROP,
    number: 1,
    name: "Guåhan Sunset Map",
    state,
    release_at: state === "upcoming" && !announced ? null : "2026-12-05T00:00:00Z",
    closes_at: state === "closed" ? "2026-12-06T00:00:00Z" : null,
    sold_out_at: state === "sold_out" ? "2026-12-05T02:00:00Z" : null,
    quantity: state === "upcoming" && !announced ? null : 100,
    per_customer_limit: 2,
  };
}
// The stand-in box faces from scripts/build-box-placeholders.mjs.
const boxFaces = (slug: string, name: string, widths: number[], aspect: string, sideAspect: string): Box => ({
  front: art(slug, "box-placeholder-front", widths, aspect, `Front of the ${name} puzzle box.`, "box_front"),
  back: art(slug, "box-placeholder-back", widths, aspect, `Back of the ${name} puzzle box.`, "box_back"),
  left: art(slug, "box-placeholder-left", [96, 192], sideAspect, `Side of the ${name} puzzle box.`, "box_left"),
  right: art(slug, "box-placeholder-right", [96, 192], sideAspect, `Side of the ${name} puzzle box.`, "box_right"),
});
const boxes: Record<string, Box> = {
  [CORE]: boxFaces(CORE, "Håfa Adai from Tumon Bay", [640, 1280], "4:3", "1:5"),
  [MAP]: boxFaces(MAP, "Guåhan Sunset Map", [512, 1024], "4:5", "3:20"),
};
const coreImages = [
  art(CORE, "finished-flat", [640, 1280, 2000], "12:7",
    "Finished puzzle of the colorful GUAM sign at Tumon Bay, with blue water and open sky.", "hero"),
  art(CORE, "piece-detail", [640, 1071], "4:3",
    "Close view of interlocking pieces in the Tumon Bay puzzle.", "detail"),
  art(CORE, "finished-tabletop", [640, 1280, 2000], "3:4",
    "Finished Håfa Adai puzzle on a tabletop, showing the GUAM sign and Tumon Bay.", "lifestyle"),
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
export interface MockExtras {
  preorder?: boolean;
  dropItems?: number;
}
// Extra products use the seed artwork, under their own names and slugs.
export function extraProducts(state: DropState, stock: Record<string, number>, { preorder = false, dropItems = 1 }: MockExtras): ProductDetail[] {
  const [core, map] = catalog(state, { ...stock });
  const copy = (base: ProductDetail, slug: string, name: string, patch: Partial<ProductDetail> = {}): ProductDetail => ({ ...base, slug, name, ...patch });
  return [
    ...(preorder ? [copy(core, PREORDER, "Hagåtña Sunrise", {
      summary: "Sunrise over Hagåtña Bay, 500 pieces.", price_cents: 4000,
      preorder: true, preorder_ships: PREORDER_SHIPS, per_customer_limit: 2,
    })] : []),
    ...(dropItems >= 2 ? [copy(map, MAP_NIGHT, "Guåhan Night Map", { price_cents: 5000 })] : []),
    ...(dropItems >= 3 ? [copy(map, MAP_TIDES, "Guåhan Tide Map", { price_cents: 5500 })] : []),
  ];
}
export function catalog(state: DropState, stock: Record<string, number>): ProductDetail[] {
  const make = (slug: string, name: string, kind: "core" | "drop", price: number, images: Art[]): ProductDetail => {
    const count = stock[slug] ?? 0;
    const open = salesOpen && (kind === "core" || state === "live");
    const available = open && count > 0;
    const availabilityState = kind === "drop" && state !== "live" ? state : count === 0 ? "sold_out" : salesOpen ? "available" : "coming_soon";
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
      alt_image: images[1] ?? null,
      box: boxes[slug] ?? null,
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
