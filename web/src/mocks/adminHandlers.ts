import { http, HttpResponse } from "msw";
import { catalog, CORE, extraProducts, MAP, DROP, dropSummary, PREORDER, PREORDER_SHIPS, type MockExtras } from "./data";
import { mockPages, mockStore, updateMockStore } from "./store";
import type { StoreSettings } from "../types";
import type { AdminDrop, AdminImage, AdminProduct, OrderDetail, OrderSummary, ProductionRun, ShippingSettings } from "../admin/adminApi";

const prefix = "*/api/v1/admin";
const now = "2026-10-29T00:00:00Z";
type MockAdmin = {
  products: AdminProduct[];
  drops: AdminDrop[];
  orders: OrderDetail[];
  invitations: { id: number; email: string; created_at: string }[];
  users: { id: number; email: string; name: string; role: string; active: boolean }[];
  subscribers: { email: string; source: string; drop_slug: string | null; created_at: string }[];
  movements: Record<string, { id: number; delta: number; reason: string; note?: string; created_at: string }[]>;
  runs: Record<string, ProductionRun[]>;
};
const BUCKET = "https://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com";
// The real file bytes, so uploaded images render through the same URLs they would in production.
const objects = new Map<string, ArrayBuffer>();
let mode = "ok";
let uploadMode = "ok";
let db: MockAdmin;
let runSequence = 1;
// mockEasyPost=1 connects EasyPost, so orders can buy labels.
let easyPost = "off";
const defaultShipping = (): ShippingSettings => ({
  mode: "flat",
  carriers: [],
  handling_fee_cents: 0,
  free_shipping_threshold_cents: null,
  flat_rates: { mainland: 800, alaska_hawaii: 1200, guam_cnmi: 1200, territories: 1200, military: 1200 },
  flat_rates_placeholder: true,
  pickup_enabled: false,
  pickup_instructions: "",
  origin: { name: "", company: "Tåno + Tåsi", phone: "", line1: "", line2: "", city: "", state: "", postal_code: "" },
  origin_complete: false,
  parcel: { weight_oz: 24, length_in: 12, width_in: 10, height_in: 3 },
  customs: { description: "Jigsaw puzzle", hs_tariff_number: "950300", origin_country: "US", signer: "" },
  tax_enabled: false,
  easypost_configured: false,
  easypost_webhook_configured: false,
});
let shipping = defaultShipping();
const shippingResponse = () => ({ ...shipping, easypost_configured: easyPost !== "off", easypost_webhook_configured: easyPost !== "off" });
export function configureEasyPostMock(next: string) {
  easyPost = next;
  shipping = defaultShipping();
  for (const order of db?.orders ?? []) order.label_available = next !== "off" && order.status === "paid" && order.fulfillment_status === "unfulfilled";
}
export const mockAdminProducts = () => db.products;
export const mockAdminDrops = () => db.drops;
let stockListener: (slug: string, delta: number) => void = () => {};
export function onAdminStockChange(listener: typeof stockListener) {
  stockListener = listener;
}
export function configureAdminMocks(nextMode = "ok", nextUploadMode = "ok", extras: MockExtras = {}) {
  mode = nextMode;
  uploadMode = nextUploadMode;
  const seed = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
  const products = [...seed, ...extraProducts("upcoming", {}, extras)].map((product, index) => ({
    ...product,
    status: "active",
    position: index + 1,
    stock_quantity: product.slug === CORE ? 40 : product.slug === MAP ? 100 : 25,
    specs: product.specs as Record<string, string | number | boolean>,
    signature: false,
    preorder: product.preorder ?? false,
    preorder_ships: product.preorder_ships ?? null,
    per_customer_limit: product.kind === "drop" ? null : product.per_customer_limit,
    drop: product.drop ? { slug: product.drop.slug, name: product.drop.name } : null,
  })) as AdminProduct[];
  const members = products
    .filter((product) => product.kind === "drop")
    .map((product) => ({ slug: product.slug, name: product.name, stock_quantity: product.stock_quantity, status: product.status }));
  const drop = {
    ...dropSummary("upcoming"),
    release_at: "2026-12-05T00:00:37Z",
    product: members[0],
    products: members,
  } as AdminDrop;
  const order: OrderDetail = {
    number: "TYT-100001",
    token: "mock-order-token",
    status: "paid",
    fulfillment_status: "unfulfilled",
    fulfillment_method: "ship",
    email: "buyer@example.com",
    total_cents: 5700,
    currency: "USD",
    item_count: 1,
    preorder_item_count: 0,
    created_at: now,
    paid_at: now,
    subtotal_cents: 4500,
    shipping_cents: 1200,
    tax_cents: 0,
    shipping_method: { label: "Standard", kind: "flat_fallback", estimate: null },
    label_available: easyPost !== "off",
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
  // A mixed cart: one preorder line and one in stock, under a single fulfill action.
  const mixed: OrderDetail = {
    ...order,
    number: "TYT-100002",
    token: "mock-preorder-token",
    item_count: 3,
    preorder_item_count: 2,
    total_cents: 11500,
    subtotal_cents: 11500,
    items: [
      { product_slug: PREORDER, name: "Hagåtña Sunrise", quantity: 2, unit_price_cents: 4000, image: products[0].images[0], preorder_ships: PREORDER_SHIPS },
      { product_slug: CORE, name: products[0].name, quantity: 1, unit_price_cents: 3500, image: products[0].images[0], preorder_ships: null },
    ],
    email_deliveries: [],
  };
  db = {
    products,
    drops: [drop],
    orders: extras.preorder ? [mixed, order] : [order],
    invitations: [{ id: 10, email: "pending@example.com", created_at: now }],
    users: [{ id: 1, email: "admin@example.com", name: "Admin Example", role: "admin", active: true }],
    subscribers: [{ email: "fan@example.com", source: "drop", drop_slug: DROP, created_at: now }],
    movements: Object.fromEntries(products.map((product) => [product.slug, []])),
    runs: Object.fromEntries(products.map((product) => [product.slug, []])),
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
const slugify = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function freeSlug(base: string) {
  const taken = new Set([...db.products.map((p) => p.slug), "new"]);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}
function placement(product: AdminProduct, body: { kind?: string; drop_slug?: string | null }) {
  const kind = body.kind ?? (body.drop_slug ? "drop" : product.kind);
  if (kind === "core") {
    if (body.drop_slug) return fail("Drop slug must be empty", { drop_slug: "Must be empty for the always-available collection" });
    return { kind, drop: null };
  }
  const drop = db.drops.find((d) => d.slug === body.drop_slug);
  if (!drop) return fail("Drop slug must name a drop", { drop_slug: "Must name a drop" });
  return { kind, drop };
}
// A drop's product list, in position order, as the serializer returns it.
function syncDrops() {
  for (const drop of db.drops) {
    drop.products = db.products
      .filter((product) => product.drop?.slug === drop.slug)
      .sort((a, b) => a.position - b.position)
      .map((product) => ({ slug: product.slug, name: product.name, stock_quantity: product.stock_quantity, status: product.status }));
    drop.product = drop.products[0] ?? null;
  }
}
function applyPlacement(product: AdminProduct, target: { kind: string; drop: AdminDrop | null }) {
  product.kind = target.kind;
  product.drop = target.drop && { slug: target.drop.slug, name: target.drop.name };
}
function moveStock(product: AdminProduct, delta: number, reason: string, note?: string) {
  product.stock_quantity += delta;
  db.movements[product.slug].unshift({ id: Date.now() + db.movements[product.slug].length, delta, reason, note, created_at: new Date().toISOString() });
  stockListener(product.slug, delta);
  syncDrops();
}
function runProblems(body: Partial<ProductionRun>, run?: ProductionRun) {
  const errors: Record<string, string> = {};
  const quantity = body.quantity ?? run?.quantity;
  if (!Number.isInteger(quantity) || quantity! < 1) errors.quantity = "Must be greater than 0";
  if (run?.status === "received" && body.quantity !== undefined && body.quantity !== run.quantity) errors.quantity = "Can't change once a run is received";
  if (body.unit_cost_cents != null && (!Number.isInteger(body.unit_cost_cents) || body.unit_cost_cents < 0)) errors.unit_cost_cents = "Must be 0 or more";
  if (body.expected_at && !/^\d{4}-\d{2}-\d{2}$/.test(body.expected_at)) errors.expected_at = "Isn't a valid date";
  return errors;
}
const validBase = (base: unknown) =>
  typeof base === "string" && (base.startsWith("/images/") || base.startsWith(`${BUCKET}/products/`)) && !base.includes("..");
function imageProblem(images: AdminImage[]) {
  const position = images.findIndex(
    (image) =>
      !["hero", "gallery", "detail", "box", "lifestyle"].includes(image.role) ||
      !image.alt?.trim() ||
      !/^[1-9]\d*:[1-9]\d*$/.test(image.aspect ?? "") ||
      !image.widths?.length ||
      !image.widths.every((width) => Number.isInteger(width) && width > 0) ||
      !validBase(image.base)
  );
  return position < 0 ? null : `Images need a valid role, alt text, aspect, widths and base (image ${position + 1})`;
}
const orderSummary = (order: OrderDetail): OrderSummary => ({
  number: order.number,
  token: order.token,
  status: order.status,
  fulfillment_status: order.fulfillment_status,
  fulfillment_method: order.fulfillment_method,
  email: order.email,
  total_cents: order.total_cents,
  currency: order.currency,
  item_count: order.item_count,
  preorder_item_count: order.preorder_item_count,
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
    if (body.tracking_number !== undefined) order.tracking_number = body.tracking_number;
    if (body.tracking_url !== undefined) order.tracking_url = body.tracking_url;
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
  http.post(`${prefix}/products`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const body = (await request.json()) as Partial<AdminProduct> & { drop_slug?: string | null };
    const errors: Record<string, string> = {};
    for (const key of ["name", "summary", "description"] as const) if (!body[key]?.trim()) errors[key] = "Can't be blank";
    if (!Number.isInteger(body.price_cents) || body.price_cents! < 0) errors.price_cents = "Must be 0 or more";
    if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
    const product = {
      slug: freeSlug(slugify(body.name!) || "product"),
      name: body.name!,
      summary: body.summary!,
      description: body.description!,
      price_cents: body.price_cents!,
      currency: "USD",
      status: body.status ?? "draft",
      position: Math.max(0, ...db.products.map((p) => p.position)) + 1,
      stock_quantity: 0,
      kind: "core",
      signature: body.signature ?? false,
      per_customer_limit: body.per_customer_limit ?? null,
      preorder: body.preorder ?? false,
      preorder_ships: body.preorder_ships ?? null,
      specs: body.specs ?? {},
      includes: body.includes ?? [],
      art: body.art ?? { credit: "", story: "" },
      placeholders: body.placeholders ?? [],
      images: [],
      drop: null,
    } as AdminProduct;
    const target = placement(product, { kind: body.kind, drop_slug: body.drop_slug });
    if (target instanceof Response) return target;
    applyPlacement(product, target);
    db.products.push(product);
    db.movements[product.slug] = [];
    db.runs[product.slug] = [];
    syncDrops();
    return HttpResponse.json({ product }, { status: 201 });
  }),
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
    const { drop_slug, kind, ...body } = (await request.json()) as Partial<AdminProduct> & { drop_slug?: string | null };
    if (kind !== undefined || drop_slug !== undefined) {
      const target = placement(product, { kind, drop_slug });
      if (target instanceof Response) return target;
      applyPlacement(product, target);
    }
    if (body.images !== undefined) {
      const problem = imageProblem(body.images);
      if (problem) return fail(problem, { images: problem });
    }
    if (body.name !== undefined && !body.name.trim())
      return fail("Name is required.", { name: "Name is required." });
    if (body.summary !== undefined && !body.summary.trim())
      return fail("Summary is required.", { summary: "Summary is required." });
    if (body.description !== undefined && !body.description.trim())
      return fail("Description is required.", { description: "Description is required." });
    if (body.price_cents !== undefined && body.price_cents < 0)
      return fail("Price must be nonnegative.", { price_cents: "Price must be nonnegative." });
    if (body.per_customer_limit != null && (!Number.isInteger(body.per_customer_limit) || body.per_customer_limit < 1))
      return fail("Limit must be at least 1.", { per_customer_limit: "Must be greater than 0" });
    const preorder = body.preorder ?? product.preorder;
    const ships = (body.preorder_ships === undefined ? product.preorder_ships : body.preorder_ships)?.trim();
    if (preorder && !ships) return fail("Preorder ships must say when it ships.", { preorder_ships: "Must say when it ships" });
    Object.assign(product, body);
    syncDrops();
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
    moveStock(product, body.delta, "admin_adjustment", body.reason);
    return HttpResponse.json({ product });
  }),
  http.get(`${prefix}/products/:slug/production_runs`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    return HttpResponse.json({ production_runs: [...(db.runs[String(params.slug)] ?? [])].reverse() });
  }),
  http.post(`${prefix}/products/:slug/production_runs`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const product = db.products.find((p) => p.slug === params.slug);
    if (!product) return fail("Product not found.");
    const body = (await request.json()) as Partial<ProductionRun>;
    const errors = runProblems(body);
    if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
    const run: ProductionRun = {
      id: runSequence++,
      quantity: body.quantity!,
      status: "ordered",
      supplier: body.supplier?.trim() || null,
      unit_cost_cents: body.unit_cost_cents ?? null,
      expected_at: body.expected_at || null,
      received_at: null,
      stock_added: null,
      notes: body.notes ?? null,
      created_at: new Date().toISOString(),
    };
    (db.runs[product.slug] ??= []).push(run);
    return HttpResponse.json({ production_run: run }, { status: 201 });
  }),
  http.patch(`${prefix}/products/:slug/production_runs/:id`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const run = db.runs[String(params.slug)]?.find((item) => String(item.id) === params.id);
    if (!run) return fail("Production run not found.");
    const body = (await request.json()) as Partial<ProductionRun>;
    const errors = runProblems(body, run);
    if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
    const { quantity, supplier, unit_cost_cents, expected_at, notes } = body;
    Object.assign(run, Object.fromEntries(Object.entries({ quantity, supplier, unit_cost_cents, expected_at, notes }).filter(([, value]) => value !== undefined)));
    return HttpResponse.json({ production_run: run, product: db.products.find((p) => p.slug === params.slug) });
  }),
  http.post(`${prefix}/products/:slug/production_runs/:id/receive`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const product = db.products.find((p) => p.slug === params.slug);
    const run = db.runs[String(params.slug)]?.find((item) => String(item.id) === params.id);
    if (!product || !run) return fail("Production run not found.");
    // Answers like the real API: a repeat changes nothing, even with another count.
    if (run.status === "received") return HttpResponse.json({ production_run: run, product });
    if (run.status !== "ordered") return fail("A canceled run can't be received.");
    const body = (await request.json().catch(() => ({}))) as { stock_added?: number | null };
    const added = body.stock_added ?? run.quantity;
    if (!Number.isInteger(added) || added < 0 || added > run.quantity)
      return fail(`Stock added must be a whole number from 0 to ${run.quantity}.`, { stock_added: `Must be a whole number from 0 to ${run.quantity}. If more arrived, change the run's quantity first.` });
    if (added > 0) moveStock(product, added, "production_received", `Production run ${run.id}`);
    Object.assign(run, { status: "received", stock_added: added, received_at: new Date().toISOString() });
    return HttpResponse.json({ production_run: run, product });
  }),
  http.post(`${prefix}/products/:slug/production_runs/:id/cancel`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const run = db.runs[String(params.slug)]?.find((item) => String(item.id) === params.id);
    if (!run) return fail("Production run not found.");
    if (run.status === "received") return fail("A received run can't be canceled. Adjust stock instead.");
    run.status = "canceled";
    return HttpResponse.json({ production_run: run, product: db.products.find((p) => p.slug === params.slug) });
  }),
  http.get(
    `${prefix}/products/:slug/inventory_movements`,
    ({ request, params }) =>
      guard(request) ?? HttpResponse.json({ inventory_movements: db.movements[String(params.slug)] ?? [] })
  ),
  http.get(`${prefix}/drops`, ({ request }) => guard(request) ?? HttpResponse.json({ drops: db.drops })),
  http.post(`${prefix}/drops`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const body = (await request.json()) as Partial<AdminDrop>;
    if (!body.name?.trim()) return fail("Name can't be blank", { name: "Can't be blank" });
    if (body.release_at && body.closes_at && body.release_at > body.closes_at)
      return fail("Release must not be after close.", { release_at: "Must not be after closes_at" });
    const number = Math.max(0, ...db.drops.map((d) => d.number)) + 1;
    const drop: AdminDrop = {
      slug: [`drop-${String(number).padStart(3, "0")}`, slugify(body.name)].filter(Boolean).join("-"),
      number,
      name: body.name,
      state: "upcoming",
      release_at: body.release_at ?? null,
      closes_at: body.closes_at ?? null,
      per_customer_limit: body.per_customer_limit ?? 2,
      quantity: body.quantity ?? 0,
      product: null,
      products: [],
    };
    db.drops.push(drop);
    return HttpResponse.json({ drop }, { status: 201 });
  }),
  http.post(`${prefix}/uploads`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    if (uploadMode === "offline") return HttpResponse.error();
    if (uploadMode === "unconfigured")
      return HttpResponse.json(
        { error: { code: "storage_unavailable", message: "Image uploads aren't set up yet. Ask Leon to check the storage settings.", details: {} } },
        { status: 503 }
      );
    const body = (await request.json()) as { product_slug: string; widths: number[]; content_type: string };
    if (!db.products.some((p) => p.slug === body.product_slug))
      return HttpResponse.json({ error: { code: "not_found", message: "We couldn't find that.", details: {} } }, { status: 404 });
    if (body.content_type !== "image/webp" || !body.widths?.length || body.widths.length > 6)
      return fail("Images must be uploaded as WebP.");
    const base = `${BUCKET}/products/${body.product_slug}/mock${crypto.randomUUID().replaceAll("-", "")}`;
    return HttpResponse.json(
      {
        base,
        uploads: body.widths.map((width) => ({
          width,
          url: `${base}-${width}.webp?X-Amz-Expires=900&X-Amz-Signature=mock`,
          headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
        })),
      },
      { status: 201 }
    );
  }),
  // Stands in for S3: like a presigned URL, it refuses a PUT without the signed headers.
  http.put(`${BUCKET}/products/*`, async ({ request }) => {
    if (uploadMode === "fail-once") {
      uploadMode = "ok";
      return new HttpResponse("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    }
    const url = new URL(request.url);
    if (
      !url.searchParams.get("X-Amz-Signature") ||
      request.headers.get("Content-Type") !== "image/webp" ||
      request.headers.get("Cache-Control") !== "public, max-age=31536000, immutable"
    )
      return new HttpResponse("<Error><Code>SignatureDoesNotMatch</Code></Error>", { status: 403 });
    const bytes = await request.arrayBuffer();
    // Refuse anything that isn't really WebP: a PNG here means the encoder fallback failed.
    const header = new TextDecoder().decode(bytes.slice(8, 12));
    if (header !== "WEBP") return new HttpResponse("<Error><Code>NotWebP</Code></Error>", { status: 400 });
    objects.set(url.pathname, bytes);
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${BUCKET}/products/*`, ({ request }) => {
    const bytes = objects.get(new URL(request.url).pathname);
    return bytes
      ? new HttpResponse(bytes, { headers: { "Content-Type": "image/webp" } })
      : new HttpResponse(null, { status: 404 });
  }),
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
  http.post(`${prefix}/orders/:number/label`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const order = db.orders.find((o) => o.number === params.number);
    if (!order || !order.label_available) return fail("Labels can only be bought for a paid, unfulfilled order that's being shipped, once EasyPost is connected.");
    if (order.label_status === "bought") return HttpResponse.json({ order });
    const body = (await request.json()) as { confirm_cents?: number };
    const price = 1865;
    if (body.confirm_cents !== price)
      return HttpResponse.json({
        error: { code: "label_price_changed", message: "A USPS Priority label costs $18.65 USD. Confirm to buy it.", details: { previous_cents: null, current_cents: price, label: "USPS Priority" } },
      }, { status: 409 });
    Object.assign(order, {
      label_status: "bought", label_url: "https://easypost-files.example/label.png", label_cost_cents: price, label_bought_at: now,
      tracking_number: "9400100000000000000000", tracking_url: "https://track.example/9400100000000000000000", tracking_status: "pre_transit", tracking_status_at: now,
    });
    return HttpResponse.json({ order });
  }),
  http.get(`${prefix}/shipping`, ({ request }) => guard(request) ?? HttpResponse.json({ shipping: shippingResponse() })),
  http.patch(`${prefix}/shipping`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const body = (await request.json()) as Partial<ShippingSettings>;
    if (body.customs && !/^[A-Z]{2}$/.test(body.customs.origin_country ?? ""))
      return fail("Check the highlighted shipping settings.", { "customs.origin_country": "Must be a two-letter country code" });
    if (body.pickup_enabled && !body.pickup_instructions?.trim())
      return fail("Check the highlighted shipping settings.", { pickup_instructions: "Must say where and when to pick up" });
    shipping = { ...shipping, ...body, flat_rates_placeholder: body.flat_rates ? false : shipping.flat_rates_placeholder };
    const origin = shipping.origin;
    shipping.origin_complete = !!(origin.line1 && origin.city && origin.state && origin.postal_code && origin.phone && (origin.name || origin.company));
    return HttpResponse.json({ shipping: shippingResponse() });
  }),
  http.get(`${prefix}/store`, ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    return HttpResponse.json({ store: { ...mockStore(), payment_mode: "stripe_test", shipping_placeholders: shipping.flat_rates_placeholder } });
  }),
  http.patch(`${prefix}/store`, async ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    const body = (await request.json()) as Partial<StoreSettings>;
    if (body.contact_email !== undefined && !/.+@.+\..+/.test(body.contact_email))
      return fail("Contact email is invalid.", { contact_email: "Enter a valid email." });
    updateMockStore(body);
    return HttpResponse.json({ store: { ...mockStore(), payment_mode: "stripe_test", shipping_placeholders: shipping.flat_rates_placeholder } });
  }),
  http.get(`${prefix}/pages`, ({ request }) => {
    const denied = guard(request);
    if (denied) return denied;
    return HttpResponse.json({ pages: mockPages });
  }),
  http.get(`${prefix}/pages/:slug`, ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const page = mockPages.find((item) => item.slug === params.slug);
    return page ? HttpResponse.json({ page }) : fail("Page not found.");
  }),
  http.patch(`${prefix}/pages/:slug`, async ({ request, params }) => {
    const denied = guard(request);
    if (denied) return denied;
    const page = mockPages.find((item) => item.slug === params.slug);
    if (!page) return fail("Page not found.");
    Object.assign(page, (await request.json()) as Partial<typeof page>);
    return HttpResponse.json({ page });
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
