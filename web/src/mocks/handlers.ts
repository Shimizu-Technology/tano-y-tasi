import { http, HttpResponse } from "msw";
import { catalog, CORE, MAP, DROP, dropSummary } from "./data";
import type { CartItem, CheckoutResult, DropState, Order, ProductDetail, Product } from "../types";
interface StoredOrder {
  order: Order;
  email: string;
}
interface Database {
  stock: Record<string, number>;
  orders: Record<string, StoredOrder>;
  attempts: Record<string, { fingerprint: string; result: CheckoutResult }>;
  subscribers: string[];
  sequence: number;
}
let db: Database;
let persist: ((db: Database) => void) | undefined;
let state: DropState = "upcoming";
let coreCount = 1;
const fresh = (): Database => ({
  stock: { [CORE]: 40, [MAP]: 100 },
  orders: {},
  attempts: {},
  subscribers: [],
  sequence: 100000,
});
export function configureMocks(
  options: { state?: DropState; coreCount?: number; database?: Database; save?: (db: Database) => void } = {}
) {
  state = options.state ?? "upcoming";
  coreCount = options.coreCount === 2 || options.coreCount === 3 ? options.coreCount : 1;
  db = options.database ?? fresh();
  for (let i = 2; i <= coreCount; i++) db.stock[`${CORE}-mock-${i}`] ??= 40;
  persist = options.save;
  if (state === "sold_out") db.stock[MAP] = 0;
}
configureMocks();
const save = () => persist?.(db);
function release(order: Order) {
  for (const item of order.items) db.stock[item.product_slug] = (db.stock[item.product_slug] ?? 0) + item.quantity;
}
function expire() {
  for (const { order } of Object.values(db.orders)) {
    if (order.status === "pending_payment" && Date.parse(order.expires_at) <= Date.now()) {
      release(order);
      order.status = "expired";
    }
  }
  save();
}
function products() {
  expire();
  const items = catalog(state === "live" && db.stock[MAP] === 0 ? "sold_out" : state, db.stock);
  for (let i = 2; i <= coreCount; i++) {
    const slug = `${CORE}-mock-${i}`;
    const copy = catalog(state, { ...db.stock, [CORE]: db.stock[slug] })[0];
    items.push({ ...copy, slug, name: `Tumon Bay — Mock ${i}` });
  }
  return items;
}
function drop() {
  const p = products()[1];
  const actualState = state === "live" && db.stock[MAP] === 0 ? "sold_out" : state;
  return { ...dropSummary(actualState), product: { ...p, drop: dropSummary(actualState) } };
}
const error = (code: string, message: string, status = 422, details: Record<string, unknown> = {}) =>
  HttpResponse.json({ error: { code, message, details } }, { status });
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
    availability: p.availability,
    drop: p.drop,
    image: p.image,
  };
}
const now = () => new Date().toISOString();
const path = (p: string) => `*/api/v1${p}`;
export const handlers = [
  http.get(path("/storefront"), () => {
    const d = drop();
    return HttpResponse.json({
      featured_drop: ["upcoming", "live"].includes(d.state) ? { ...d, product: listProduct(d.product) } : null,
      core_products: products()
        .filter((p) => p.kind === "core")
        .map(listProduct),
      server_time: now(),
    });
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
      : error("not_found", "We couldn’t find that puzzle.", 404);
  }),
  http.get(path("/drops"), () => {
    const detail = drop();
    const d = { ...detail, product: listProduct(detail.product) };
    return HttpResponse.json({
      current: d.state === "live" ? d : null,
      upcoming: d.state === "upcoming" ? [d] : [],
      archive: ["sold_out", "closed"].includes(d.state) ? [d] : [],
      server_time: now(),
    });
  }),
  http.get(path("/drops/:slug"), ({ params }) =>
    params.slug === DROP
      ? HttpResponse.json({ drop: drop(), server_time: now() })
      : error("not_found", "We couldn’t find that drop.", 404)
  ),
  http.post(path("/checkout"), async ({ request }) => {
    let body: { email?: unknown; idempotency_key?: unknown; items?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Please check your checkout details.", 400);
    }
    expire();
    if (!validEmail(body.email)) return error("invalid_email", "Enter a valid email address.");
    const email = body.email.trim().toLowerCase();
    if (typeof body.idempotency_key !== "string" || !body.idempotency_key)
      return error("malformed", "A checkout key is required.", 400);
    if (!Array.isArray(body.items) || body.items.length === 0)
      return error("empty_cart", "Add a puzzle to your cart first.");
    const items = body.items as CartItem[];
    const fingerprint = JSON.stringify({ email, items });
    const previous = db.attempts[body.idempotency_key];
    if (previous)
      return previous.fingerprint === fingerprint
        ? HttpResponse.json(previous.result)
        : error("idempotency_conflict", "This checkout has changed. Please start a new checkout.", 409);
    const seen = new Set<string>();
    const all = products();
    for (const item of items) {
      const p = all.find((p) => p.slug === item.product_slug);
      const detail = { product_slug: item.product_slug };
      if (!p) return error("unknown_product", "This puzzle is no longer available.", 422, detail);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || seen.has(item.product_slug))
        return error("quantity_invalid", "Choose a whole quantity above zero, with one line per puzzle.", 422, detail);
      seen.add(item.product_slug);
      if (p.kind === "drop" && ["upcoming", "closed"].includes(state))
        return error("drop_not_live", "This drop is not available.", 422, {
          ...detail,
          release_at: p.drop!.release_at,
        });
      const limit = p.per_customer_limit ?? 10;
      const purchased =
        p.kind === "drop"
          ? Object.values(db.orders)
              .filter((o) => o.email === email && ["paid", "pending_payment"].includes(o.order.status))
              .reduce(
                (n, o) =>
                  n + o.order.items.filter((i) => i.product_slug === p.slug).reduce((s, i) => s + i.quantity, 0),
                0
              )
          : 0;
      if (item.quantity + purchased > limit)
        return error("limit_exceeded", `Limit ${limit} per customer.`, 422, {
          ...detail,
          limit,
          already_purchased: purchased,
        });
      if (db.stock[p.slug] === 0)
        return error("sold_out", `${p.name} just sold out.`, 422, { ...detail, available: 0 });
      if (item.quantity > db.stock[p.slug])
        return error("insufficient_stock", "There aren’t enough puzzles left.", 422, {
          ...detail,
          available: db.stock[p.slug],
        });
    }
    // No asynchronous work between validation and reservation: one atomic mock operation.
    for (const item of items) db.stock[item.product_slug] -= item.quantity;
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const orderItems = items.map((i) => {
      const p = all.find((p) => p.slug === i.product_slug)!;
      return { ...i, name: p.name, unit_price_cents: p.price_cents, image: p.image };
    });
    const total = orderItems.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);
    const order: Order = {
      token,
      number: `TYT-${++db.sequence}`,
      status: "pending_payment",
      email_masked: email.replace(/^(.).*@/, "$1•••@"),
      items: orderItems,
      subtotal_cents: total,
      total_cents: total,
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
    db.attempts[body.idempotency_key] = { fingerprint, result };
    save();
    return HttpResponse.json(result, { status: 201 });
  }),
  http.get(path("/orders/:token"), ({ params }) => {
    expire();
    const stored = db.orders[String(params.token)];
    return stored
      ? HttpResponse.json({ order: stored.order })
      : error("not_found", "This order link could not be found.", 404);
  }),
  http.post(path("/orders/:token/cancel"), ({ params }) => cancel(String(params.token))),
  http.post(path("/simulated_payments/:token/cancel"), ({ params }) => cancel(String(params.token))),
  http.post(path("/simulated_payments/:token/complete"), ({ params }) => {
    expire();
    const stored = db.orders[String(params.token)];
    if (!stored) return error("not_found", "Order not found.", 404);
    if (stored.order.status === "pending_payment") {
      stored.order.status = "paid";
      stored.order.paid_at = now();
      save();
    }
    return HttpResponse.json({ order: stored.order });
  }),
  http.post(path("/subscribers"), async ({ request }) => {
    let body: { email?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Please enter your email.", 400);
    }
    if (!validEmail(body.email)) return error("invalid_email", "Enter a valid email address.");
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
  if (!stored) return error("not_found", "Order not found.", 404);
  if (stored.order.status === "pending_payment") {
    release(stored.order);
    stored.order.status = "canceled";
    save();
  }
  return HttpResponse.json({ order: stored.order });
}
