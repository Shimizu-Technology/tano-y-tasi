import { http, HttpResponse } from "msw";
import { catalog, CORE, MAP, DROP, dropSummary } from "./data";
import type { AdminDrop, AdminProduct, OrderDetail, OrderSummary } from "../admin/adminApi";

const prefix = "*/api/v1/admin";
const now = "2026-10-29T00:00:00Z";
type MockAdmin = {
  products: AdminProduct[];
  drops: AdminDrop[];
  orders: OrderDetail[];
  invitations: { id: number; email: string; created_at: string }[];
  users: { id: number; email: string; name: string; role: string; active: boolean }[];
  subscribers: { email: string; source: string; drop_slug: string | null; created_at: string }[];
  movements: Record<string, { id: number; delta: number; reason: string; created_at: string }[]>;
};
let mode = "ok";
let db: MockAdmin;
export function configureAdminMocks(nextMode = "ok") {
  mode = nextMode;
  const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 }).map((product) => ({
    ...product,
    status: "active",
    position: product.kind === "core" ? 1 : 2,
    stock_quantity: product.kind === "core" ? 40 : 100,
    specs: product.specs as Record<string, string | number | boolean>,
    drop: product.drop ? { slug: product.drop.slug, name: product.drop.name } : null,
  })) as AdminProduct[];
  const drop = {
    ...dropSummary("upcoming"),
    release_at: "2026-12-05T00:00:37Z",
    product: { slug: MAP, name: products[1].name, stock_quantity: 100 },
  } as AdminDrop;
  const order: OrderDetail = {
    number: "TYT-100001",
    token: "mock-order-token",
    status: "paid",
    fulfillment_status: "unfulfilled",
    email: "buyer@example.com",
    total_cents: 4500,
    currency: "USD",
    item_count: 1,
    created_at: now,
    paid_at: now,
    subtotal_cents: 4500,
    items: [
      {
        product_slug: MAP,
        name: products[1].name,
        quantity: 1,
        unit_price_cents: 4500,
        image: products[1].images[0],
      },
    ],
    shipping: {
      name: "Example Buyer",
      phone: "+1 671 555 0100",
      address: {
        line1: "123 Marine Drive",
        line2: "Unit 4",
        city: "Hagåtña",
        state: "GU",
        postal_code: "96910",
        country: "US",
      },
    },
    provider: "stripe",
    provider_payment_intent_id: "pi_test_123",
    tracking_number: null,
    tracking_url: null,
    fulfilled_at: null,
    refunded_cents: 0,
    attention_reason: null,
    dispute_status: null,
    notes: "",
    email_deliveries: [
      {
        id: 1,
        kind: "order_confirmation",
        to: "buyer@example.com",
        subject: "We received your Tåno + Tåsi order",
        status: "sent",
        attempts: 1,
        sent_at: now,
        last_error: null,
      },
    ],
  };
  db = {
    products,
    drops: [drop],
    orders: [order],
    invitations: [{ id: 10, email: "pending@example.com", created_at: now }],
    users: [{ id: 1, email: "admin@example.com", name: "Admin Example", role: "admin", active: true }],
    subscribers: [{ email: "fan@example.com", source: "drop", drop_slug: DROP, created_at: now }],
    movements: { [CORE]: [], [MAP]: [] },
  };
}
configureAdminMocks();
function unauthorized(request: Request) {
  if (request.headers.get("Authorization") !== "Bearer tyt-admin-test-auth")
    return HttpResponse.json(
      { error: { code: "unauthenticated", message: "Session expired" } },
      { status: 401 }
    );
  if (mode === "expired")
    return HttpResponse.json(
      { error: { code: "unauthenticated", message: "Session expired" } },
      { status: 401 }
    );
  if (mode === "forbidden")
    return HttpResponse.json({ error: { code: "forbidden", message: "Access denied" } }, { status: 403 });
  if (mode === "unavailable")
    return HttpResponse.json(
      { error: { code: "identity_unavailable", message: "Identity unavailable" } },
      { status: 503 }
    );
  return null;
}
function guard(request: Request) {
  return unauthorized(request);
}
const fail = (message: string, details: Record<string, string> = {}) =>
  HttpResponse.json({ error: { code: "invalid", message, details } }, { status: 422 });
const orderSummary = (order: OrderDetail): OrderSummary => ({
  number: order.number,
  token: order.token,
  status: order.status,
  fulfillment_status: order.fulfillment_status,
  email: order.email,
  total_cents: order.total_cents,
  currency: order.currency,
  item_count: order.item_count,
  created_at: order.created_at,
  paid_at: order.paid_at,
});
export const adminHandlers = [
  http.get(`${prefix}/me`, ({ request }) => guard(request) ?? HttpResponse.json({ user: db.users[0] })),
  http.get(
    `${prefix}/dashboard`,
    ({ request }) =>
      guard(request) ??
      HttpResponse.json({
        orders: {
          paid_count: db.orders.filter((o) => o.status === "paid").length,
          paid_total_cents: db.orders
            .filter((o) => o.status === "paid")
            .reduce((sum, o) => sum + o.total_cents, 0),
          unfulfilled_count: db.orders.filter((o) => o.fulfillment_status === "unfulfilled").length,
          needs_attention_count: 0,
        },
        recent_orders: db.orders.map(orderSummary),
        featured_drop: db.drops[0] ?? null,
        low_stock: db.products
          .filter((p) => p.stock_quantity <= 10)
          .map((p) => ({ slug: p.slug, name: p.name, stock_quantity: p.stock_quantity })),
        subscribers_count: db.subscribers.length,
      })
  ),
  http.get(`${prefix}/orders`, ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const query = new URL(request.url).searchParams;
    const page = Math.max(1, Number(query.get("page") || 1));
    const filtered = db.orders.filter(
      (order) =>
        (!query.get("status") || order.status === query.get("status")) &&
        (!query.get("fulfillment") || order.fulfillment_status === query.get("fulfillment")) &&
        (!query.get("q") ||
          `${order.number} ${order.email}`.toLowerCase().includes(query.get("q")!.toLowerCase()))
    );
    return HttpResponse.json({
      orders: filtered.slice((page - 1) * 25, page * 25).map(orderSummary),
      page,
      pages: Math.max(1, Math.ceil(filtered.length / 25)),
      total: filtered.length,
    });
  }),
  http.get(
    `${prefix}/orders/:number`,
    ({ request, params }) =>
      guard(request) ?? HttpResponse.json({ order: db.orders.find((o) => o.number === params.number) })
  ),
  http.patch(`${prefix}/orders/:number`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order) return fail("Order not found.");
    const body = (await request.json()) as { notes: string };
    order.notes = body.notes;
    return HttpResponse.json({ order });
  }),
  http.post(`${prefix}/orders/:number/fulfill`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order || order.status !== "paid") return fail("Only paid orders can be fulfilled.");
    const body = (await request.json()) as {
      tracking_number?: string;
      tracking_url?: string;
      notify?: boolean;
    };
    order.fulfillment_status = "fulfilled";
    order.tracking_number = body.tracking_number;
    order.tracking_url = body.tracking_url;
    order.fulfilled_at = now;
    if (body.notify && !order.email_deliveries.some((d) => d.kind === "order_shipped"))
      order.email_deliveries.push({
        id: 2,
        kind: "order_shipped",
        to: order.email,
        status: "sent",
        attempts: 1,
        sent_at: now,
      });
    return HttpResponse.json({ order });
  }),
  http.post(`${prefix}/orders/:number/refund`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order || !["paid", "needs_attention"].includes(order.status)) return fail("Only paid orders can be refunded.");
    const body = (await request.json()) as { amount_cents?: number; refund_key?: string };
    if (!body.refund_key) return fail("A refund_key is required.");
    const refunded = order.refunded_cents ?? 0;
    const amount = body.amount_cents ?? order.total_cents - refunded;
    if (amount < 1 || amount > order.total_cents - refunded) return fail("Enter a valid refund.");
    order.refunded_cents = refunded + amount;
    if (order.refunded_cents === order.total_cents) order.status = "refunded";
    return HttpResponse.json({ order });
  }),
  http.post(`${prefix}/orders/:number/mark_paid`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order || order.status !== "needs_attention") return fail("Only orders that need attention can be marked paid.");
    order.status = "paid";
    order.attention_reason = null;
    return HttpResponse.json({ order });
  }),
  http.post(`${prefix}/orders/:number/unfulfill`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order) return fail("Order not found.");
    order.fulfillment_status = "unfulfilled";
    order.fulfilled_at = null;
    return HttpResponse.json({ order });
  }),
  http.post(`${prefix}/orders/:number/email_deliveries/:id/resend`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const delivery = db.orders
      .find((o) => o.number === params.number)
      ?.email_deliveries.find((d) => String(d.id) === String(params.id));
    if (!delivery) return fail("Delivery not found.");
    delivery.attempts++;
    delivery.status = "sent";
    delivery.sent_at = now;
    return HttpResponse.json({ email_delivery: delivery });
  }),
  http.get(
    `${prefix}/products`,
    ({ request }) => guard(request) ?? HttpResponse.json({ products: db.products })
  ),
  http.get(
    `${prefix}/products/:slug`,
    ({ request, params }) =>
      guard(request) ?? HttpResponse.json({ product: db.products.find((p) => p.slug === params.slug) })
  ),
  http.patch(`${prefix}/products/:slug`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const product = db.products.find((p) => p.slug === params.slug);
    if (!product) return fail("Product not found.");
    const body = (await request.json()) as Partial<AdminProduct>;
    if (body.name !== undefined && !body.name.trim())
      return fail("Name is required.", { name: "Name is required." });
    if (body.summary !== undefined && !body.summary.trim())
      return fail("Summary is required.", { summary: "Summary is required." });
    if (body.description !== undefined && !body.description.trim())
      return fail("Description is required.", { description: "Description is required." });
    if (body.price_cents !== undefined && body.price_cents < 0)
      return fail("Price must be nonnegative.", { price_cents: "Price must be nonnegative." });
    Object.assign(product, body);
    return HttpResponse.json({ product });
  }),
  http.post(`${prefix}/products/:slug/stock_adjustments`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const product = db.products.find((p) => p.slug === params.slug);
    if (!product) return fail("Product not found.");
    const body = (await request.json()) as { delta: number; reason: string };
    if (
      !Number.isInteger(body.delta) ||
      body.delta === 0 ||
      !body.reason?.trim() ||
      product.stock_quantity + body.delta < 0
    )
      return fail("Invalid stock adjustment.", { delta: "Adjustment must leave stock at zero or above." });
    product.stock_quantity += body.delta;
    db.movements[product.slug].unshift({
      id: Date.now(),
      delta: body.delta,
      reason: body.reason,
      created_at: new Date().toISOString(),
    });
    if (product.slug === MAP) db.drops[0].product!.stock_quantity = product.stock_quantity;
    return HttpResponse.json({ product });
  }),
  http.get(
    `${prefix}/products/:slug/inventory_movements`,
    ({ request, params }) =>
      guard(request) ?? HttpResponse.json({ inventory_movements: db.movements[String(params.slug)] ?? [] })
  ),
  http.get(`${prefix}/drops`, ({ request }) => guard(request) ?? HttpResponse.json({ drops: db.drops })),
  http.get(
    `${prefix}/drops/:slug`,
    ({ request, params }) =>
      guard(request) ?? HttpResponse.json({ drop: db.drops.find((d) => d.slug === params.slug) })
  ),
  http.patch(`${prefix}/drops/:slug`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const drop = db.drops.find((d) => d.slug === params.slug);
    if (!drop) return fail("Drop not found.");
    const body = (await request.json()) as Partial<AdminDrop>;
    if (body.release_at && body.closes_at && body.release_at > body.closes_at)
      return fail("Close must follow release.", { closes_at: "Close must follow release." });
    Object.assign(drop, body);
    return HttpResponse.json({ drop });
  }),
  http.get(`${prefix}/subscribers`, ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const page = Math.max(1, Number(new URL(request.url).searchParams.get("page") || 1));
    return HttpResponse.json({
      subscribers: db.subscribers.slice((page - 1) * 25, page * 25),
      page,
      pages: Math.max(1, Math.ceil(db.subscribers.length / 25)),
      total: db.subscribers.length,
    });
  }),
  http.get(
    `${prefix}/subscribers.csv`,
    ({ request }) =>
      guard(request) ??
      new HttpResponse(
        `email,source,drop_slug,created_at\n${db.subscribers.map((s) => `${s.email},${s.source},${s.drop_slug ?? ""},${s.created_at}`).join("\n")}`,
        { headers: { "Content-Type": "text/csv" } }
      )
  ),
  http.get(
    `${prefix}/users`,
    ({ request }) =>
      guard(request) ??
      HttpResponse.json({ users: db.users.filter((u) => u.active), invitations: db.invitations })
  ),
  http.post(`${prefix}/invitations`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const body = (await request.json()) as { email: string };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
      return fail("Enter a valid email.", { email: "Enter a valid email." });
    if (!db.invitations.some((i) => i.email === body.email))
      db.invitations.push({ id: Date.now(), email: body.email, created_at: now });
    return HttpResponse.json({ invitation: db.invitations.at(-1) });
  }),
  http.delete(`${prefix}/invitations/:id`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    db.invitations = db.invitations.filter((i) => String(i.id) !== String(params.id));
    return HttpResponse.json({ revoked: true });
  }),
  http.patch(`${prefix}/users/:id`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const user = db.users.find((u) => String(u.id) === String(params.id));
    if (!user) return fail("Admin not found.");
    const active = db.users.filter((u) => u.active);
    if (active.length <= 1) return fail("The last active admin cannot be deactivated.");
    user.active = false;
    return HttpResponse.json({ user });
  }),
];
