import { http, HttpResponse } from "msw";
import { adminHandlers, mockAdminDrops, mockAdminProducts, onAdminStockChange } from "./adminHandlers";
import { catalog, CORE, extraProducts, MAP, DROP, dropSummary, mockSalesOpen, MAP_NIGHT, MAP_TIDES, type MockExtras } from "./data";
import { mockStore, mockPages } from "./store";
import { addressErrors, cleanAddress } from "../shippingAddress";
import type { Art, CartItem, CheckoutResult, DropState, DropSummary, Order, ProductDetail, Product, ShippingAddress, ShippingOption } from "../types";
interface StoredOrder {
  order: Order;
  email: string;
}
interface Database {
  stock: Record<string, number>;
  orders: Record<string, StoredOrder>;
  attempts: Record<string, { fingerprint: string; result: CheckoutResult; ready?: boolean }>;
  subscribers: string[];
  sequence: number;
  quotedOnce?: boolean;
}
let db: Database;
let persist: ((db: Database) => void) | undefined;
let state: DropState = "upcoming";
let coreCount = 1;
let extras: MockExtras = {};
let paymentFailures: ("same_key" | "new_checkout")[] = [];
// How /shipping/quotes behaves: flat rates, live EasyPost rates, EasyPost down (falls back to flat rates),
// a first quote that has already expired, Guam pickup switched on, or a threshold that makes shipping free.
export type MockShipping = "flat" | "live" | "down" | "expired" | "pickup" | "free" | "tax";
let shippingMode: MockShipping = "flat";
const fresh = (): Database => ({
  stock: { [CORE]: 40, [MAP]: 100 },
  orders: {},
  attempts: {},
  subscribers: [],
  sequence: 100000,
});
export function configureMocks(
  options: {
    state?: DropState;
    coreCount?: number;
    extras?: MockExtras;
    database?: Database;
    save?: (db: Database) => void;
    paymentFailures?: ("same_key" | "new_checkout")[];
    shipping?: MockShipping;
  } = {}
) {
  paymentFailures = [...(options.paymentFailures ?? [])];
  shippingMode = options.shipping ?? "flat";
  state = options.state ?? "upcoming";
  coreCount = options.coreCount === 2 || options.coreCount === 3 ? options.coreCount : 1;
  extras = options.extras ?? {};
  db = options.database ?? fresh();
  for (let i = 2; i <= coreCount; i++) db.stock[`${CORE}-mock-${i}`] ??= 40;
  for (const product of extraProducts(state, {}, extras)) db.stock[product.slug] ??= 25;
  persist = options.save;
  if (state === "sold_out") for (const slug of [MAP, MAP_NIGHT, MAP_TIDES]) if (slug in db.stock) db.stock[slug] = 0;
}
configureMocks();
// Stock the admin adds, by adjustment or by receiving a run, reaches the storefront.
onAdminStockChange((slug, delta) => {
  if (db.stock[slug] !== undefined) db.stock[slug] += delta;
});
const save = () => persist?.(db);
function release(order: Order) {
  for (const item of order.items) db.stock[item.product_slug] = (db.stock[item.product_slug] ?? 0) + item.quantity;
}
function expire() {
  for (const { order } of Object.values(db.orders)) {
    if (order.status === "pending_payment" && Date.parse(order.expires_at) + 5 * 60_000 <= Date.now()) {
      release(order);
      order.status = "expired";
    }
  }
  save();
}
function rawProducts() {
  const items = [...catalog(state, db.stock), ...extraProducts(state, db.stock, extras)];
  for (let i = 2; i <= coreCount; i++) {
    const slug = `${CORE}-mock-${i}`;
    const copy = catalog(state, { ...db.stock, [CORE]: db.stock[slug] })[0];
    items.push({ ...copy, slug, name: `Tumon Bay — Mock ${i}` });
  }
  return items;
}
// As the API does: box faces are served apart from the ordered images, once there is a front and a back.
const BOX_FACES = ["box_front", "box_back", "box_left", "box_right"];
function splitImages(images: Art[]) {
  const face = (role: string) => images.find((image) => image.role === role) ?? null;
  const [front, back] = [face("box_front"), face("box_back")];
  return {
    images: images.filter((image) => !BOX_FACES.includes(image.role)),
    box: front && back ? { front, back, left: face("box_left"), right: face("box_right") } : null,
    faces: images.some((image) => BOX_FACES.includes(image.role)),
  };
}
// What the admin saved shows on the storefront, as it would with the real API.
function withAdminEdits(items: ProductDetail[]) {
  const edited = items.map((item) => {
    const saved = mockAdminProducts().find((p) => p.slug === item.slug);
    if (!saved?.images.length) return item;
    const { images, box, faces } = splitImages(saved.images);
    return { ...item, name: saved.name, summary: saved.summary, description: saved.description, price_cents: saved.price_cents,
      // The mock admin doesn't list the stand-in faces, so they stay until the merchant adds faces of their own.
      images, image: images[0], alt_image: images[1] ?? null, box: faces ? box : item.box,
      kind: saved.kind as ProductDetail["kind"], drop: saved.drop ? ({ slug: saved.drop.slug } as DropSummary) : null,
      signature: saved.signature, preorder: saved.preorder, preorder_ships: saved.preorder_ships, per_customer_limit: saved.per_customer_limit };
  });
  const added = mockAdminProducts()
    .filter((p) => !items.some((item) => item.slug === p.slug) && p.status !== "draft" && p.images.length > 0)
    .map((p): ProductDetail => {
      db.stock[p.slug] ??= p.stock_quantity;
      const { images, box } = splitImages(p.images);
      return { slug: p.slug, name: p.name, kind: p.kind as ProductDetail["kind"], price_cents: p.price_cents, currency: "USD", summary: p.summary, description: p.description,
        availability: { state: "closed", purchasable: false, remaining: null, low_stock: false },
        drop: p.drop ? ({ slug: p.drop.slug } as DropSummary) : null, image: images[0], alt_image: images[1] ?? null, box, images, specs: p.specs as ProductDetail["specs"], includes: p.includes,
        art: p.art, signature: p.signature, preorder: p.preorder, preorder_ships: p.preorder_ships, per_customer_limit: p.per_customer_limit, max_per_order: 0, placeholders: p.placeholders };
    });
  return [...edited, ...added];
}
// The seed drop follows ?mockDrop. A drop made in the admin follows its own dates, as the real API does.
function dropFor(slug: string, members: ProductDetail[]): DropSummary | null {
  const out = members.every((p) => (db.stock[p.slug] ?? 0) === 0);
  if (slug === DROP) return dropSummary(state === "live" && out ? "sold_out" : state);
  const saved = mockAdminDrops().find((d) => d.slug === slug);
  if (!saved) return null;
  const released = !!saved.release_at && Date.parse(saved.release_at) <= Date.now();
  const closed = !!saved.closes_at && Date.parse(saved.closes_at) <= Date.now();
  const dropState: DropState = !released ? "upcoming" : closed ? "closed" : out ? "sold_out" : mockSalesOpen() ? "live" : "upcoming";
  return { slug, number: saved.number, name: saved.name, state: dropState, release_at: saved.release_at, closes_at: saved.closes_at, sold_out_at: null,
    quantity: saved.quantity > 0 ? saved.quantity : null, per_customer_limit: saved.per_customer_limit };
}
function products() {
  expire();
  const items = withAdminEdits(rawProducts());
  const drops = new Map<string, DropSummary | null>();
  for (const slug of new Set(items.flatMap((p) => (p.drop ? [p.drop.slug] : []))))
    drops.set(slug, dropFor(slug, items.filter((p) => p.drop?.slug === slug)));
  return items
    .map((item): ProductDetail => {
      const drop = item.drop ? drops.get(item.drop.slug) ?? null : null;
      const count = db.stock[item.slug] ?? 0;
      const limit = item.per_customer_limit ?? (item.kind === "drop" ? drop?.per_customer_limit ?? null : null);
      const stateName = drop && drop.state !== "live" ? drop.state : count === 0 ? "sold_out" : !mockSalesOpen() ? "coming_soon" : item.preorder ? "preorder" : "available";
      const purchasable = stateName === "available" || stateName === "preorder";
      return { ...item, drop, per_customer_limit: limit,
        availability: { state: stateName, purchasable, remaining: count <= 20 ? count : null, low_stock: count > 0 && count <= 20 },
        max_per_order: purchasable ? Math.min(limit ?? 10, 10, count) : 0 };
    })
    .sort((a, b) => Number(!!b.signature) - Number(!!a.signature));
}
function publicDrops() {
  const all = products();
  const slugs = [...new Set(all.flatMap((p) => (p.drop ? [p.drop.slug] : [])))];
  return slugs.map((slug) => {
    const members = all.filter((p) => p.drop?.slug === slug);
    return { ...members[0].drop!, product: members[0], products: members };
  }).sort((a, b) => a.number - b.number);
}
const error = (code: string, message: string, status = 422, details: Record<string, unknown> = {}) =>
  HttpResponse.json({ error: { code, message, details } }, { status });
function provision(attempt: Database["attempts"][string], status: number) {
  const order = db.orders[attempt.result.order.token].order;
  if (attempt.ready === false && order.status !== "pending_payment")
    return error("payment_unavailable", "Payment is unavailable for this checkout. Please start a new checkout.", 503, {
      retry: "new_checkout",
    });
  const failure = attempt.ready === false ? paymentFailures.shift() : undefined;
  if (failure) {
    if (failure === "new_checkout") {
      release(order);
      order.status = "canceled";
    }
    save();
    return error(
      "payment_unavailable",
      failure === "same_key"
        ? "Payment is temporarily unavailable. Retry the same request with the same idempotency_key."
        : "Payment is unavailable for this checkout. Please start a new checkout.",
      503,
      { retry: failure }
    );
  }
  attempt.ready = true;
  save();
  return HttpResponse.json({ ...attempt.result, order: { ...attempt.result.order, status: order.status } }, { status });
}
const FLAT: Record<string, number> = { mainland: 800 };
const zoneRate = (state: string) => (/^[A-Z]{2}$/.test(state) && !["AK", "HI", "GU", "MP", "PR", "VI", "AS", "AA", "AE", "AP"].includes(state) ? FLAT.mainland : 1200);
const addressKey = (address: ShippingAddress) => JSON.stringify(address).toLowerCase();
type MockQuote = { amount_cents: number; label: string; kind: ShippingOption["kind"]; estimate: string | null; instructions?: string | null; address: string; items: string; expires_at: number };
function itemsKey(items: CartItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.product_slug, (quantities.get(item.product_slug) ?? 0) + item.quantity);
  return JSON.stringify([...quantities].sort(([a], [b]) => a.localeCompare(b)));
}
function issueQuote(option: Omit<MockQuote, "address" | "items" | "expires_at">, address: ShippingAddress, items: CartItem[], expires_at: number): ShippingOption {
  const quote: MockQuote = { ...option, address: addressKey(address), items: itemsKey(items), expires_at };
  return { quote: `mock.${btoa(encodeURIComponent(JSON.stringify(quote)))}`, label: option.label, amount_cents: option.amount_cents, kind: option.kind, estimate: option.estimate, instructions: option.instructions ?? null };
}
function readQuote(token: unknown): MockQuote | null {
  try {
    if (typeof token !== "string" || !token.startsWith("mock.")) return null;
    return JSON.parse(decodeURIComponent(atob(token.slice(5)))) as MockQuote;
  } catch {
    return null;
  }
}
const PICKUP_INSTRUCTIONS = "Tumon, Guam. We'll email you when it's ready.";
function quoteOptions(address: ShippingAddress, items: CartItem[]) {
  // The first quote for "expired" is already out of date, so checkout refuses it and the cart re-quotes.
  const expires = shippingMode === "expired" && !db.quotedOnce ? Date.now() - 1000 : Date.now() + 30 * 60_000;
  db.quotedOnce = true;
  const flat = zoneRate(address.state);
  const base = shippingMode === "live"
    ? [
        { label: "USPS Ground Advantage", amount_cents: flat - 150, kind: "live" as const, estimate: "About 5 business days after it ships" },
        { label: "USPS Priority", amount_cents: flat + 700, kind: "live" as const, estimate: "About 3 business days after it ships" },
      ]
    : [{ label: "Standard", amount_cents: shippingMode === "free" ? 0 : flat, kind: shippingMode === "down" ? ("flat_fallback" as const) : ("flat" as const), estimate: null }];
  const options = base.map((option) => issueQuote(option, address, items, expires));
  if (shippingMode === "pickup" && address.state === "GU")
    options.push(issueQuote({ label: "Pick up in Guam", amount_cents: 0, kind: "pickup", estimate: null, instructions: PICKUP_INSTRUCTIONS }, address, items, expires));
  return options;
}
const validEmail = (email: unknown): email is string =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
function listProduct(p: ProductDetail): Product {
  return {
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    price_cents: p.price_cents,
    currency: p.currency,
    summary: p.summary,
    signature: p.signature ?? false,
    preorder: p.preorder ?? false,
    preorder_ships: p.preorder ? p.preorder_ships : null,
    per_customer_limit: p.per_customer_limit,
    specs: { piece_count: p.specs.piece_count, finished_size: p.specs.finished_size },
    availability: p.availability,
    drop: p.drop,
    image: p.image,
    alt_image: p.alt_image,
    box: p.box ?? null,
  };
}
function listDrop(d: ReturnType<typeof publicDrops>[number]) {
  return { ...d, product: listProduct(d.product), products: d.products.map(listProduct) };
}
const now = () => new Date().toISOString();
const path = (p: string) => `*/api/v1${p}`;
export const handlers = [
  ...adminHandlers,
  http.get(path("/storefront"), () => {
    const drops = publicDrops();
    const d = drops.find((item) => item.state === "live") ?? drops.find((item) => item.state === "upcoming");
    return HttpResponse.json({
      featured_drop: d ? listDrop(d) : null,
      core_products: products()
        .filter((p) => p.kind === "core")
        .map(listProduct),
      store: mockStore(),
      server_time: now(),
    });
  }),
  http.get(path("/store"), () => HttpResponse.json({ store: mockStore() })),
  http.get(path("/pages/:slug"), ({ params }) => {
    const page = mockPages.find((item) => item.slug === params.slug);
    if (!page) return HttpResponse.json({ error: { code: "not_found", message: "We couldn't find that." } }, { status: 404 });
    return HttpResponse.json({ page: { ...page, body: page.body.replaceAll("{{contact_email}}", mockStore().contact_email) } });
  }),
  http.get(path("/products"), ({ request }) => {
    const kind = new URL(request.url).searchParams.get("kind");
    return HttpResponse.json({
      products: products()
        .filter((p) => !kind || p.kind === kind)
        .map(listProduct),
    });
  }),
  http.get(path("/products/:slug"), ({ params }) => {
    const product = products().find((p) => p.slug === params.slug);
    return product
      ? HttpResponse.json({ product, server_time: now() })
      : error("not_found", "We couldn't find that.", 404);
  }),
  http.get(path("/drops"), () => {
    const drops = publicDrops().map(listDrop);
    return HttpResponse.json({
      current: drops.find((d) => d.state === "live") ?? null,
      upcoming: drops.filter((d) => d.state === "upcoming"),
      archive: drops.filter((d) => ["sold_out", "closed"].includes(d.state)),
      server_time: now(),
    });
  }),
  http.get(path("/drops/:slug"), ({ params }) => {
    const drop = publicDrops().find((d) => d.slug === params.slug);
    return drop ? HttpResponse.json({ drop, server_time: now() }) : error("not_found", "We couldn't find that.", 404);
  }),
  http.post(path("/shipping/quotes"), async ({ request }) => {
    if (!mockSalesOpen()) return error("store_closed", "The store isn't open for orders yet. Join the list and you'll hear first.");
    let body: { items?: CartItem[]; address?: ShippingAddress };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Provide a valid JSON request.", 400);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) return error("empty_cart", "Your cart is empty.");
    const fields = addressErrors(cleanAddress(body.address ?? ({} as ShippingAddress)));
    if (!body.address || Object.keys(fields).length) return error("invalid_address", "Check your shipping address.", 422, { fields });
    const options = quoteOptions(cleanAddress(body.address), body.items);
    save();
    return HttpResponse.json({ options, tax_enabled: shippingMode === "tax" });
  }),
  http.post(path("/checkout"), async ({ request }) => {
    if (!mockSalesOpen()) return error("store_closed", "The store isn't open for orders yet. Join the list and you'll hear first.");
    let body: { email?: unknown; idempotency_key?: unknown; items?: unknown; shipping?: { quote?: unknown; address?: ShippingAddress } };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Provide a valid JSON request.", 400);
    }
    expire();
    if (!body || typeof body !== "object") return error("malformed", "Provide a valid JSON request.", 400);
    const rawEmail = typeof body.email === "string" ? body.email.trim() : body.email;
    if (!validEmail(rawEmail)) return error("invalid_email", "Enter a valid email address.");
    const email = rawEmail.toLowerCase();
    if (
      typeof body.idempotency_key !== "string" ||
      !body.idempotency_key.trim() ||
      new TextEncoder().encode(body.idempotency_key).length > 200
    )
      return error("malformed", "An idempotency_key is required (maximum 200 bytes).", 400);
    if (body.items == null || (Array.isArray(body.items) && body.items.length === 0))
      return error("empty_cart", "Your cart is empty.");
    if (!Array.isArray(body.items)) return error("quantity_invalid", "items must be an array.");
    if (body.items.length > 100) return error("quantity_invalid", "Provide an array of up to 100 cart items.");
    const quantities = new Map<string, number>();
    for (const item of body.items) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return error("quantity_invalid", "Each cart item must contain a product and quantity.");
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)
        return error("quantity_invalid", "Quantities must be whole numbers from 1 to 10.");
      if (typeof item.product_slug !== "string" || !item.product_slug.trim())
        return error("unknown_product", "This product is unavailable.");
      const quantity = (quantities.get(item.product_slug) ?? 0) + item.quantity;
      if (quantity > 10) return error("quantity_invalid", "A product can have at most 10 units per order.");
      quantities.set(item.product_slug, quantity);
    }
    const items: CartItem[] = [...quantities]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([product_slug, quantity]) => ({ product_slug, quantity }));
    if (!body.shipping?.quote || !body.shipping.address)
      return error("shipping_required", "Add a shipping address to continue. If you don't see the form, refresh the page.");
    const quote = readQuote(body.shipping.quote);
    if (!quote) return error("shipping_quote_invalid", "Your shipping options need refreshing. Choose one again to continue.");
    const shippingAddress = cleanAddress(body.shipping.address);
    // What was chosen, not the token, as on the server: a re-quote of the same option is the same request.
    const fingerprint = JSON.stringify({ email, items, amount: quote.amount_cents, label: quote.label, kind: quote.kind, address: addressKey(shippingAddress) });
    const previous = db.attempts[body.idempotency_key];
    if (previous)
      return previous.fingerprint === fingerprint
        ? provision(previous, 200)
        : error("idempotency_conflict", "This checkout key was already used for a different cart.", 409);
    const all = products();
    for (const item of items) {
      const p = all.find((p) => p.slug === item.product_slug);
      const detail = { product_slug: item.product_slug };
      if (!p) return error("unknown_product", "This product is unavailable.");
      if (p.drop && ["upcoming", "closed"].includes(p.drop.state))
        return error("drop_not_live", "This drop is not open for checkout.", 422, {
          ...detail,
          release_at: p.drop!.release_at,
        });
      const limit = p.per_customer_limit;
      const purchased = Object.values(db.orders)
        .filter((o) => o.email === email && ["paid", "pending_payment"].includes(o.order.status))
        .reduce(
          (n, o) =>
            n + o.order.items.filter((i) => i.product_slug === p.slug).reduce((s, i) => s + i.quantity, 0),
          0
        );
      if (limit != null && item.quantity + purchased > limit)
        return error("limit_exceeded", `${p.name} is limited to ${limit} per customer.`, 422, {
          ...detail,
          limit,
          already_purchased: purchased,
        });
      if (db.stock[p.slug] === 0)
        return error("sold_out", `${p.name} just sold out.`, 422, { ...detail, available: 0 });
      if (item.quantity > db.stock[p.slug])
        return error("insufficient_stock", "There aren't enough pieces left for that quantity.", 422, {
          ...detail,
          available: db.stock[p.slug],
        });
    }
    // Only a new reservation checks these: a retry keeps the quote that priced its order.
    if (quote.address !== addressKey(shippingAddress) || quote.items !== itemsKey(items))
      return error("shipping_quote_invalid", "Your shipping options need refreshing. Choose one again to continue.");
    if (quote.expires_at <= Date.now()) return error("shipping_quote_expired", "Your shipping options expired. Choose one again to continue.");
    // No asynchronous work between validation and reservation: one atomic mock operation.
    for (const item of items) db.stock[item.product_slug] -= item.quantity;
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const orderItems = items.map((i) => {
      const p = all.find((p) => p.slug === i.product_slug)!;
      return { ...i, name: p.name, unit_price_cents: p.price_cents, image: p.image, preorder_ships: p.preorder ? p.preorder_ships : null };
    });
    const subtotal = orderItems.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);
    const order: Order = {
      token,
      number: `TYT-${++db.sequence}`,
      status: "pending_payment",
      email_masked: email.replace(/^(.).*@/, "$1•••@"),
      items: orderItems,
      subtotal_cents: subtotal,
      shipping_cents: quote.amount_cents,
      tax_cents: 0,
      fulfillment_method: quote.kind === "pickup" ? "pickup" : "ship",
      shipping_method: { label: quote.label, estimate: quote.estimate, instructions: quote.instructions ?? null },
      total_cents: subtotal + quote.amount_cents,
      currency: "USD",
      created_at: now(),
      paid_at: null,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    db.orders[token] = { order, email };
    const origin = typeof window === "undefined" ? "http://localhost:5181" : window.location.origin;
    const result: CheckoutResult = {
      order: { token, number: order.number, status: order.status, expires_at: order.expires_at },
      payment_url: `${origin}/checkout/simulated/${token}`,
    };
    const attempt = { fingerprint, result, ready: false };
    db.attempts[body.idempotency_key] = attempt;
    return provision(attempt, 201);
  }),
  http.get(path("/orders/:token"), ({ params }) => {
    expire();
    const stored = db.orders[String(params.token)];
    return stored ? HttpResponse.json({ order: stored.order }) : error("not_found", "We couldn't find that.", 404);
  }),
  http.post(path("/orders/:token/cancel"), ({ params }) => cancel(String(params.token))),
  http.post(path("/simulated_payments/:token/cancel"), ({ params }) => cancel(String(params.token))),
  http.post(path("/simulated_payments/:token/complete"), ({ params }) => {
    expire();
    const stored = db.orders[String(params.token)];
    if (!stored) return error("not_found", "We couldn't find that.", 404);
    if (stored.order.status === "pending_payment") {
      stored.order.status = "paid";
      stored.order.paid_at = now();
      save();
    }
    return HttpResponse.json({ order: stored.order });
  }),
  http.post(path("/subscribers"), async ({ request }) => {
    let body: { email?: unknown; source?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Provide a valid JSON request.", 400);
    }
    if (!validEmail(body.email)) return error("invalid_email", "Enter a valid email address.");
    // The API accepts only these sources (api/app/models/subscriber.rb).
    if (body.source != null && !["home", "drop", "product", "footer"].includes(body.source as string))
      return error("malformed", "Check your email address and signup details.", 400);
    const email = body.email.toLowerCase().trim();
    const exists = db.subscribers.includes(email);
    if (!exists) db.subscribers.push(email);
    save();
    return HttpResponse.json({ subscribed: true }, { status: exists ? 200 : 201 });
  }),
  http.get("*/up", () => HttpResponse.json({ status: "ok" })),
];
function cancel(token: string) {
  expire();
  const stored = db.orders[token];
  if (!stored) return error("not_found", "We couldn't find that.", 404);
  if (stored.order.status === "pending_payment") {
    release(stored.order);
    stored.order.status = "canceled";
    save();
  }
  return HttpResponse.json({ order: stored.order });
}
