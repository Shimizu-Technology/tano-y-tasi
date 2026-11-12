import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { restoreInitialData } from "../../src/api";
import { catalog, CORE, MAP, dropSummary } from "../../src/mocks/data";
import { enhanceResponse, matchRoute, serializeData, transformHtml } from "./storefront";
import type { InitialData } from "./storefront";
import type { Drops } from "../../src/types";

const [core, map] = catalog("upcoming", { [CORE]: 50, [MAP]: 100 });
const server_time = "2026-10-29T00:00:00Z";
const snapshotTime = Date.parse(server_time);
const drop = { ...dropSummary("upcoming"), product: map };
const drops: Drops = { current: null, upcoming: [drop], archive: [], server_time };
const snapshot = (pathname = "/"): InitialData => ({ pathname, snapshotTime,
  storefront: { featured_drop: drop, core_products: [core], server_time } });
const html = '<html><head><!-- tyt:meta:start --><title>Default</title><!-- tyt:meta:end --></head><body><div id="root"></div></body></html>';
const original = () => new Response(html, { headers: { "content-type": "text/html", "content-security-policy": "script-src 'self'", etag: "original", "content-length": "123" } });
const request = (path = "/", method = "GET", accept = "text/html") => new Request(`https://shop.example${path}`, { method, headers: { accept } });
const fetcher = vi.fn<typeof fetch>(async (input) => {
  const path = new URL(String(input)).pathname;
  const data = path === "/api/v1/storefront" ? snapshot().storefront : path === "/api/v1/drops" ? drops :
    path.startsWith("/api/v1/products/") ? { product: core, server_time } : { drop, server_time };
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
});
afterEach(() => { vi.clearAllMocks(); document.head.innerHTML = ""; document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

it.each(["/", "/shop", "/drop", "/story", "/archive", `/products/${CORE}`, `/drops/${drop.slug}`, "/info/shipping", "/info/faq", "/info/contact", "/shop/"])("matches public HTML route %s", (path) => {
  expect(matchRoute(path)).not.toBeNull();
});
it.each(["/admin", "/admin/products", "/assets/main.js", "/images/a.webp", "/index.html", "/unknown", "/info/unknown", "/products/a.json", "/products/a/b", "/drops/a%2Ejs"])("excludes %s", (path) => {
  expect(matchRoute(path)).toBeNull();
});
it("replaces default tags with complete absolute product metadata and matching responsive preload", () => {
  const data = { ...snapshot(`/products/${CORE}`), product: { product: core, server_time } };
  document.head.innerHTML = transformHtml(html, data, "https://custom.example");
  expect(document.title).toBe(`${core.name} — Tåno + Tåsi`);
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute("href", `https://custom.example/products/${CORE}`);
  for (const [key, value] of Object.entries({ title: `${core.name} — Tåno + Tåsi`, description: core.summary, image: `https://custom.example/images/og/${CORE}.jpg`, url: `https://custom.example/products/${CORE}`, type: "product", site_name: "Tåno + Tåsi" })) {
    expect(document.querySelectorAll(`[property="og:${key}"]`)).toHaveLength(1);
    expect(document.querySelector(`[property="og:${key}"]`)).toHaveAttribute("content", value);
  }
  expect(document.querySelector('[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  // The gallery leads with the box, so its front is what gets preloaded, at the box's sizes.
  const front = core.box!.front;
  expect(document.querySelector('link[as="image"]')).toHaveAttribute("imagesrcset", front.widths.map((w) => `${front.base}-${w}.webp ${w}w`).join(", "));
  expect(document.querySelector('link[as="image"]')).toHaveAttribute("imagesizes", "(min-width: 900px) 34vw, 70vw");
  expect(document.querySelector('link[as="image"]')).toHaveAttribute("fetchpriority", "high");
  // Without a box, or from an API that doesn't send one yet, the first photo leads.
  for (const box of [null, undefined]) {
    document.head.innerHTML = transformHtml(html, { ...data, product: { product: { ...core, box }, server_time } }, "https://custom.example");
    expect(document.querySelector('link[as="image"]')).toHaveAttribute("imagesrcset", core.image.widths.map((w) => `${core.image.base}-${w}.webp ${w}w`).join(", "));
    expect(document.querySelector('link[as="image"]')).toHaveAttribute("imagesizes", "(min-width: 900px) 58vw, calc(100vw - 32px)");
  }
});
it("uses drop-specific OG and brand OG for other pages", () => {
  expect(transformHtml(html, { ...snapshot("/drop"), drop: { drop, server_time, receivedAt: snapshotTime } })).toContain(`/images/og/${MAP}.jpg`);
  expect(transformHtml(html, snapshot())).toContain("/images/og/brand.jpg");
  // The home hero is the same photo in every drop state, so the preload never depends on the drop.
  expect(transformHtml(html, snapshot())).toContain("finished-tabletop-640.webp");
  expect(transformHtml(html, snapshot())).not.toContain(`${map.image.base}-640.webp`);
  expect(transformHtml(html, { ...snapshot(), storefront: { ...snapshot().storefront, featured_drop: null } })).toContain("finished-tabletop-640.webp");
});
it("escapes metadata and JSON without executable inline scripts or dollar-pattern substitutions", () => {
  const hostile = '</script><script>alert("x")</script>&\u2028\u2029 $&';
  const data = { ...snapshot(`/products/${CORE}`), product: { product: { ...core, name: hostile, summary: hostile }, server_time } };
  const output = transformHtml(html, data);
  expect(output).not.toContain(hostile);
  expect(serializeData(data)).not.toMatch(/[<>&\u2028\u2029]/);
  document.head.innerHTML = output;
  expect(document.querySelectorAll("script")).toHaveLength(1);
  expect(document.querySelector("script")).toHaveAttribute("type", "application/json");
  expect(JSON.parse(document.querySelector("script")!.textContent!).product.product.name).toBe(hostile);
  expect(document.title).toContain(hostile);
});
it("describes a drop with several products as the drop, without preloading one product's art", () => {
  const several = { ...drop, products: [map, { ...map, slug: "other" }] };
  const result = transformHtml(html, { ...snapshot(`/drops/${drop.slug}`), drop: { drop: several, server_time, receivedAt: snapshotTime } });
  document.head.innerHTML = result.match(/<head>([\s\S]*)<\/head>/)![1];
  expect(document.title).toBe(`${drop.name} — Tåno + Tåsi`);
  expect(document.querySelector("[data-tyt-preload]")).toBeNull();
  expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute("content", "website");
});
it("leaves unknown routes and unmarked HTML unchanged", () => {
  expect(transformHtml(html, snapshot("/unknown"))).toBe(html);
  expect(transformHtml("<html></html>", snapshot())).toBe("<html></html>");
});
it.each(["/", `/products/${CORE}`, "/drop", `/drops/${drop.slug}`, "/archive"])("fetches correct query payloads for %s and keeps CSP/cache headers", async (path) => {
  const response = await enhanceResponse(request(path), original(), { fetcher, now: () => snapshotTime });
  document.head.innerHTML = await response.text();
  const data = JSON.parse(document.querySelector("#tyt-initial-data")!.textContent!) as InitialData;
  expect(data.storefront).toEqual(snapshot().storefront);
  expect(data.snapshotTime).toBe(snapshotTime);
  if (path.startsWith("/products")) expect(data.product?.product.slug).toBe(CORE);
  if (path === "/archive" || path === "/drop") expect(data.drops).toEqual(drops);
  if (path.startsWith("/drop")) expect(data.drop).toEqual({ drop, server_time, receivedAt: snapshotTime });
  expect(response.headers.get("content-security-policy")).toBe("script-src 'self'");
  expect(response.headers.get("netlify-cdn-cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=300");
  expect(response.headers.has("etag")).toBe(false);
  expect(response.headers.has("content-length")).toBe(false);
});
it.each(["/admin", "/admin/orders", "/assets/main.js", "/unknown"])("does not fetch or mutate excluded route %s", async (path) => {
  const response = original();
  expect(await enhanceResponse(request(path), response, { fetcher })).toBe(response);
  expect(fetcher).not.toHaveBeenCalled();
});
it("excludes non-GET and non-HTML requests/responses", async () => {
  for (const req of [request("/", "POST"), request("/", "GET", "application/json")]) {
    const response = original();
    expect(await enhanceResponse(req, response, { fetcher })).toBe(response);
  }
  const response = new Response("image", { headers: { "content-type": "image/png" } });
  expect(await enhanceResponse(request(), response, { fetcher })).toBe(response);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["network", "status", "json"])("returns original HTML unchanged after %s failure", async (failure) => {
  const response = original();
  const failing = vi.fn<typeof fetch>(async () => {
    if (failure === "network") throw new Error("offline");
    return new Response(failure === "json" ? "not json" : "unavailable", { status: failure === "status" ? 503 : 200 });
  });
  expect(await enhanceResponse(request(), response, { fetcher: failing })).toBe(response);
  expect(await response.text()).toBe(html);
});
it("times out even if fetch ignores abort and preserves the original response", async () => {
  const response = original();
  let signal: AbortSignal | undefined;
  const hanging = vi.fn<typeof fetch>((_, options) => { signal = options?.signal ?? undefined; return new Promise(() => {}); });
  expect(await enhanceResponse(request(), response, { fetcher: hanging, timeoutMs: 5 })).toBe(response);
  expect(signal?.aborted).toBe(true);
  expect(await response.text()).toBe(html);
});
it.each([`/products/${CORE}`, "/drop", `/drops/${drop.slug}`, "/archive"])("hydrates exact page query shapes and snapshot age for %s", (path) => {
  window.history.replaceState(null, "", path);
  const data: InitialData = { ...snapshot(path), product: { product: core, server_time }, drops,
    drop: { drop, server_time, receivedAt: snapshotTime } };
  document.body.innerHTML = `<script type="application/json" id="tyt-initial-data">${serializeData(data)}</script>`;
  const client = new QueryClient();
  const before = Date.now();
  restoreInitialData(client);
  const after = Date.now();
  expect(client.getQueryData(["storefront"])).toEqual(data.storefront);
  expect(client.getQueryData(["product", CORE])).toEqual(data.product);
  expect(client.getQueryData(["drops"])).toEqual(drops);
  const slug = path.replace(/\/$/, "").split("/")[2] ?? "featured";
  const seededDrop = client.getQueryData<NonNullable<InitialData["drop"]>>(["drop", slug]);
  expect(seededDrop).toEqual({ ...data.drop, receivedAt: seededDrop?.receivedAt });
  for (const stamp of [seededDrop!.receivedAt, client.getQueryState(["product", CORE])!.dataUpdatedAt]) {
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  }
  expect(client.getQueryDefaults(["storefront"]).staleTime).toBe(0);
  expect(document.getElementById("tyt-initial-data")).toBeNull();
});
it("uses the shopper's clock and still refetches on mount when the edge clock is skewed", async () => {
  // Shopper's clock is one hour behind the edge that built the snapshot.
  vi.useFakeTimers({ now: snapshotTime - 3_600_000, toFake: ["Date"] });
  try {
    window.history.replaceState(null, "", "/drop");
    const data: InitialData = { ...snapshot("/drop"), drops, drop: { drop, server_time, receivedAt: snapshotTime } };
    document.body.innerHTML = `<script type="application/json" id="tyt-initial-data">${serializeData(data)}</script>`;
    const client = new QueryClient();
    const restoredAt = Date.now();
    restoreInitialData(client);
    // Countdown math (release - server_time - (now - receivedAt)) starts from the snapshot's server_time.
    const seeded = client.getQueryData<{ receivedAt: number }>(["drop", "featured"]);
    expect(seeded?.receivedAt).toBe(restoredAt);
    const queryFn = vi.fn(async () => data.drop);
    const observer = new QueryObserver(client, { queryKey: ["drop", "featured"], queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});
it("ignores malformed or mismatched snapshots", () => {
  for (const content of ["{broken", JSON.stringify(snapshot("/other"))]) {
    document.body.innerHTML = `<script id="tyt-initial-data" type="application/json">${content}</script>`;
    const client = new QueryClient();
    restoreInitialData(client);
    expect(client.getQueryData(["storefront"])).toBeUndefined();
    expect(document.getElementById("tyt-initial-data")).toBeNull();
  }
});

it("preloads a product image stored on the media bucket under its absolute URL", () => {
  const base = "https://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com/products/new-puzzle/abc123";
  const art = { role: "hero", alt: "New puzzle", base, widths: [640, 1280], aspect: "4:3" };
  const product = { ...core, slug: "new-puzzle", image: art, images: [art], box: null };
  const result = transformHtml(html, { ...snapshot("/products/new-puzzle"), product: { product, server_time } });
  expect(result).toContain(`imagesrcset="${base}-640.webp 640w, ${base}-1280.webp 1280w"`);
  expect(result).toContain("/images/og/brand.jpg");
});
