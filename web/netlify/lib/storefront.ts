import type { Art, Drop, Drops, ProductDetail, Storefront } from "../../src/types.ts";

export const DEFAULT_SITE_URL = "https://tanoytasi.shimizu-technology.com";
export const DEFAULT_API_URL = "https://tano-y-tasi-api.onrender.com";
export const DESCRIPTION = "Premium puzzles of Guåhan. A piece of home, wherever you are.";
export interface InitialData {
  snapshotTime: number;
  pathname: string;
  storefront: Storefront;
  product?: { product: ProductDetail; server_time: string };
  drops?: Drops;
  drop?: { drop: Drop | null; server_time: string; receivedAt: number };
}

type Route = { kind: "home" | "shop" | "drop" | "product" | "archive" | "story" | "info"; slug?: string };
export function matchRoute(pathname: string): Route | null {
  // Match only public HTML pages. Encoded punctuation and nested paths are excluded too.
  const path = pathname.replace(/\/$/, "") || "/";
  const fixed = { "/": "home", "/shop": "shop", "/drop": "drop", "/story": "story", "/archive": "archive" } as const;
  if (path in fixed) return { kind: fixed[path as keyof typeof fixed] };
  const match = /^\/(products|drops|info)\/([a-z0-9-]+)$/.exec(path);
  if (!match || (match[1] === "info" && !["shipping", "faq", "contact"].includes(match[2]))) return null;
  return { kind: match[1] === "products" ? "product" : match[1] === "drops" ? "drop" : "info", slug: match[2] };
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function serializeData(data: InitialData): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
const tabletop: Art = {
  base: "/images/products/hafa-adai-from-tumon-bay/finished-tabletop", widths: [640, 1280, 2000],
  aspect: "3:4", role: "hero", alt: "Finished Tumon Bay puzzle",
};
export function transformHtml(html: string, data: InitialData, siteUrl = DEFAULT_SITE_URL): string {
  const route = matchRoute(data.pathname);
  if (!route || !html.includes("<!-- tyt:meta:start -->")) return html;
  const product = data.product?.product ?? data.drop?.drop?.product;
  const titles = { home: "A Piece of Home.", shop: "Shop", drop: "Drops", product: "Puzzle", archive: "Archive", story: "Our Story", info: { shipping: "Shipping & Returns", faq: "FAQ", contact: "Contact" }[route.slug ?? ""] ?? "Information" };
  const title = `${product?.name ?? titles[route.kind]} — Tåno + Tåsi`;
  const description = product?.summary ?? DESCRIPTION;
  const canonical = new URL(data.pathname, siteUrl).href;
  // Only the bundled catalog has generated OG derivatives. New catalog items use the brand fallback.
  const ogSlug = product && ["hafa-adai-from-tumon-bay", "guahan-sunset-map"].includes(product.slug) ? product.slug : "brand";
  const image = new URL(`/images/og/${ogSlug}.jpg`, siteUrl).href;
  const meta = (key: string, content: string, property = true) => `<meta data-tyt-meta ${property ? "property" : "name"}="${key}" content="${escapeHtml(content)}" />`;
  const tags = [
    `<title data-tyt-meta>${escapeHtml(title)}</title>`, meta("description", description, false),
    `<link data-tyt-meta rel="canonical" href="${escapeHtml(canonical)}" />`,
    meta("og:title", title), meta("og:description", description), meta("og:image", image),
    meta("og:url", canonical), meta("og:type", product ? "product" : "website"), meta("og:site_name", "Tåno + Tåsi"),
    meta("twitter:card", "summary_large_image", false),
  ];
  const hero = product?.images[0] ?? (route.kind === "home" ? data.storefront.featured_drop?.product.image ?? tabletop : undefined);
  if (hero) {
    // Must match the rendered <img sizes> so the browser reuses the preloaded candidate.
    const sizes = route.kind === "home" ? "(min-width: 900px) 60vw, 100vw" : "(min-width: 900px) 58vw, calc(100vw - 32px)";
    tags.push(`<link data-tyt-preload rel="preload" as="image" imagesrcset="${escapeHtml(hero.widths.map((w) => `${hero.base}-${w}.webp ${w}w`).join(", "))}" imagesizes="${sizes}" fetchpriority="high" />`);
  }
  tags.push(`<script type="application/json" id="tyt-initial-data">${serializeData(data)}</script>`);
  // Use a callback so user-supplied dollar replacement patterns remain literal.
  return html.replace(/<!-- tyt:meta:start -->[\s\S]*?<!-- tyt:meta:end -->/, () => tags.join("\n"));
}

interface Options { apiUrl?: string; siteUrl?: string; timeoutMs?: number; fetcher?: typeof fetch; now?: () => number }
export async function enhanceResponse(request: Request, original: Response, options: Options = {}): Promise<Response> {
  const url = new URL(request.url);
  const route = matchRoute(url.pathname);
  const accept = request.headers.get("accept") ?? "*/*";
  if (!route || request.method !== "GET" || !/(text\/html|\*\/\*)/i.test(accept) ||
      !original.ok || !original.headers.get("content-type")?.includes("text/html")) return original;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const now = options.now ?? Date.now;
  try {
    const fetcher = options.fetcher ?? fetch;
    const get = async <T>(path: string): Promise<T> => {
      const response = await fetcher(`${(options.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "")}/api/v1${path}`, {
        signal: controller.signal, headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Catalog ${response.status}`);
      return response.json();
    };
    const load = async (): Promise<InitialData> => {
      const storefrontPromise = get<Storefront>("/storefront");
      const productPromise = route.kind === "product" ? get<NonNullable<InitialData["product"]>>(`/products/${route.slug}`) : undefined;
      const dropsPromise = route.kind === "archive" || (route.kind === "drop" && !route.slug) ? get<Drops>("/drops") : undefined;
      const dropPromise = route.kind === "drop" && route.slug ? get<{ drop: Drop; server_time: string }>(`/drops/${route.slug}`) : undefined;
      const [storefront, product, drops, detail] = await Promise.all([storefrontPromise, productPromise, dropsPromise, dropPromise]);
      let drop = detail;
      if (route.kind === "drop" && !route.slug && drops) {
        const selected = drops.current ?? drops.upcoming[0] ?? drops.archive[0];
        drop = selected ? await get(`/drops/${selected.slug}`) : undefined;
      }
      const snapshotTime = now();
      return { snapshotTime, pathname: url.pathname, storefront, ...(product && { product }), ...(drops && { drops }),
        ...(route.kind === "drop" && { drop: { drop: drop?.drop ?? null, server_time: drop?.server_time ?? drops!.server_time, receivedAt: snapshotTime } }) };
    };
    // Race the entire fetch + body-read sequence, including the featured-drop lookup.
    const data = await Promise.race([load(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Catalog timeout")); }, options.timeoutMs ?? 1200);
    })]);
    const html = await original.clone().text();
    const transformed = transformHtml(html, data, options.siteUrl);
    if (transformed === html) return original;
    const headers = new Headers(original.headers);
    for (const name of ["content-length", "content-encoding", "etag", "last-modified"]) headers.delete(name);
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.set("Netlify-CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
    return new Response(transformed, { status: original.status, headers });
  } catch {
    return original;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
