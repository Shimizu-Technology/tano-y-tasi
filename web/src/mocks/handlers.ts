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
  attempts: Record<string, { fingerprint: string; result: CheckoutResult; ready?: boolean }>;
  subscribers: string[];
  sequence: number;
}
let db: Database;
let persist: ((db: Database) => void) | undefined;
let state: DropState = "upcoming";
let coreCount = 1;
let paymentFailures: ("same_key" | "new_checkout")[] = [];
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
    database?: Database;
    save?: (db: Database) => void;
    paymentFailures?: ("same_key" | "new_checkout")[];
  } = {}
) {
  paymentFailures = [...(options.paymentFailures ?? [])];
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
    if (order.status === "pending_payment" && Date.parse(order.expires_at) + 5 * 60_000 <= Date.now()) {
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
      : error("not_found", "We couldn't find that.", 404);
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
      : error("not_found", "We couldn't find that.", 404)
  ),
  http.post(path("/checkout"), async ({ request }) => {
    let body: { email?: unknown; idempotency_key?: unknown; items?: unknown };
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
    const fingerprint = JSON.stringify({ email, items });
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
      if (p.kind === "drop" && ["upcoming", "closed"].includes(state))
        return error("drop_not_live", "This drop is not open for checkout.", 422, {
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
      if (p.kind === "drop" && item.quantity + purchased > limit)
        return error("limit_exceeded", `This drop is limited to ${limit} per customer.`, 422, {
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
    let body: { email?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return error("malformed", "Provide a valid JSON request.", 400);
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
  if (!stored) return error("not_found", "We couldn't find that.", 404);
  if (stored.order.status === "pending_payment") {
    release(stored.order);
    stored.order.status = "canceled";
    save();
  }
  return HttpResponse.json({ order: stored.order });
}
