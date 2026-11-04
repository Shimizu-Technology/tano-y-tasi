import { api, ApiError, API_URL } from "../api";
import { configureMocks } from "./handlers";
import { configureAdminMocks } from "./adminHandlers";
import { CORE, MAP, MAP_NIGHT, DROP, PREORDER, PREORDER_SHIPS } from "./data";
import type { CartItem, ShippingAddress } from "../types";
const items = [{ product_slug: MAP, quantity: 1 }];
const GUAM: ShippingAddress = { name: "A Buyer", line1: "1 Marine Drive", line2: "", city: "Hagåtña", state: "GU", postal_code: "96910", phone: "" };
// The quote is fetched for this cart and address, as the real checkout does.
const shipped = async (cart: CartItem[], address = GUAM) => ({ quote: (await api.shippingQuotes(cart, address)).options[0].quote, address });
const pay = async (email: string, cart: CartItem[], key: string) =>
  api.checkout(email, cart, key, cart.length ? await shipped(cart) : { quote: "mock.none", address: GUAM });
const start = (email = "guest@example.com", key = crypto.randomUUID()) => pay(email, items, key);
beforeEach(() => configureMocks({ state: "live" }));
it("returns the seed catalog and complete drop shapes", async () => {
  const data = await api.storefront();
  expect(data.featured_drop?.product.slug).toBe(MAP);
  expect(data.core_products[0].slug).toBe(CORE);
  expect((await api.drop(DROP)).drop.product.images).toHaveLength(4);
});
it("reuses an identical checkout and rejects changed payloads with the same key", async () => {
  const key = crypto.randomUUID();
  const a = await start("a@example.com", key);
  const b = await start("a@example.com", key);
  expect(a).toEqual(b);
  await expect(start("b@example.com", key)).rejects.toMatchObject({
    status: 409,
    body: { code: "idempotency_conflict" },
  });
});
it("completes payment once and counts limits across pending and paid orders", async () => {
  const a = await start();
  const token = a.order.token;
  await api.simulated(token, "complete");
  await api.simulated(token, "complete");
  expect((await api.order(token)).order.status).toBe("paid");
  await start("GUEST@example.com");
  await expect(start()).rejects.toMatchObject({ body: { code: "limit_exceeded", details: { already_purchased: 2 } } });
});
it("cancels idempotently and releases the email allowance", async () => {
  const a = await start();
  await api.cancel(a.order.token);
  await api.cancel(a.order.token);
  expect((await api.order(a.order.token)).order.status).toBe("canceled");
  await expect(start()).resolves.toHaveProperty("payment_url");
});
it("never oversells a final unit under concurrent checkout attempts", async () => {
  configureMocks({
    state: "live",
    database: { stock: { [CORE]: 40, [MAP]: 1 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 },
  });
  const results = await Promise.allSettled([start("a@example.com"), start("b@example.com")]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  expect(failed.reason).toBeInstanceOf(ApiError);
  expect(failed.reason.body.code).toBe("sold_out");
  expect((await api.product(MAP)).product.availability.remaining).toBe(0);
});
it.each(["upcoming", "closed"] as const)("rejects checkout when drop is %s", async (state) => {
  configureMocks({ state });
  await expect(start()).rejects.toMatchObject({ body: { code: "drop_not_live" } });
});
it("expires old holds on the next request and restores stock", async () => {
  const a = await start();
  const order = (await api.order(a.order.token)).order;
  order.expires_at = "2020-01-01T00:00:00Z";
  configureMocks({
    state: "live",
    database: {
      stock: { [CORE]: 40, [MAP]: 0 },
      orders: { [order.token]: { order, email: "guest@example.com" } },
      attempts: {},
      subscribers: [],
      sequence: 100001,
    },
  });
  expect((await api.order(order.token)).order.status).toBe("expired");
  expect((await api.product(MAP)).product.availability.remaining).toBe(1);
});
it("validates email and quantity and preserves stock on invalid requests", async () => {
  await expect(start("invalid")).rejects.toMatchObject({ body: { code: "invalid_email" } });
  await expect(
    pay("a@example.com", [{ product_slug: MAP, quantity: 0 }], crypto.randomUUID())
  ).rejects.toMatchObject({ body: { code: "quantity_invalid" } });
  await expect(pay("a@example.com", [], crypto.randomUUID())).rejects.toMatchObject({
    body: { code: "empty_cart" },
  });
});
it("subscribes idempotently and rejects invalid email", async () => {
  for (const [email, status] of [
    ["a@example.com", 201],
    ["A@example.com", 200],
  ] as const) {
    const r = await fetch(`${API_URL}/api/v1/subscribers`, {
      method: "POST",
      body: JSON.stringify({ email, source: "home" }),
    });
    expect(r.status).toBe(status);
  }
  await expect(api.subscribe("bad", "home")).rejects.toMatchObject({ body: { code: "invalid_email" } });
});
it("retains the final unit on transient failure and provisions the same reservation on retry", async () => {
  configureMocks({
    state: "live",
    paymentFailures: ["same_key"],
    database: { stock: { [CORE]: 40, [MAP]: 1 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 },
  });
  const key = crypto.randomUUID();
  await expect(start("guest@example.com", key)).rejects.toMatchObject({
    status: 503,
    body: { code: "payment_unavailable", details: { retry: "same_key" } },
  });
  expect((await api.product(MAP)).product.availability.remaining).toBe(0);
  const result = await start("guest@example.com", key);
  expect(result.order.number).toBe("TYT-100001");
  expect((await api.product(MAP)).product.availability.remaining).toBe(0);
});
it("releases a definitive rejection, refuses its key, and accepts a new checkout", async () => {
  configureMocks({ state: "live", paymentFailures: ["new_checkout"] });
  const key = crypto.randomUUID();
  for (let i = 0; i < 2; i++) {
    await expect(start("guest@example.com", key)).rejects.toMatchObject({
      status: 503,
      body: { code: "payment_unavailable", details: { retry: "new_checkout" } },
    });
  }
  const result = await start();
  expect(result.order.number).toBe("TYT-100002");
});
it("matches Rails limit-error details exactly", async () => {
  await start();
  await start();
  try {
    await start();
    expect.fail("Checkout should fail");
  } catch (error) {
    expect((error as ApiError).body).toEqual({
      code: "limit_exceeded",
      message: "Guåhan Sunset Map is limited to 2 per customer.",
      details: { product_slug: MAP, limit: 2, already_purchased: 2 },
    });
  }
});
it.each([
  ["unknown_product", [{ product_slug: "missing", quantity: 1 }], {}],
  ["quantity_invalid", [{ product_slug: MAP, quantity: 11 }], {}],
  ["quantity_invalid", [{ product_slug: MAP, quantity: 0 }], {}],
  ["empty_cart", [], {}],
])("matches Rails' %s detail shape", async (code, cart, details) => {
  try {
    await pay("guest@example.com", cart as typeof items, crypto.randomUUID());
    expect.fail("Checkout should fail");
  } catch (error) {
    expect((error as ApiError).body.code).toBe(code);
    expect((error as ApiError).body.details).toEqual(details);
  }
});
it("normalizes and aggregates duplicate lines like Rails before idempotency checks", async () => {
  const key = crypto.randomUUID();
  const result = await pay("GUEST@example.com", [items[0], items[0]], key);
  const retry = await pay("guest@example.com", [{ product_slug: MAP, quantity: 2 }], key);
  expect(retry).toEqual(result);
  expect((await api.order(result.order.token)).order.items).toHaveLength(1);
});
it("matches Rails stock and drop error details", async () => {
  configureMocks({ state: "upcoming" });
  await expect(start()).rejects.toMatchObject({
    body: { code: "drop_not_live", details: { product_slug: MAP, release_at: "2026-12-05T00:00:00Z" } },
  });
  configureMocks({
    state: "live",
    database: { stock: { [CORE]: 1, [MAP]: 0 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 },
  });
  await expect(start()).rejects.toMatchObject({
    body: { code: "sold_out", details: { product_slug: MAP, available: 0 } },
  });
  await expect(
    pay("guest@example.com", [{ product_slug: CORE, quantity: 2 }], crypto.randomUUID())
  ).rejects.toMatchObject({ body: { code: "insufficient_stock", details: { product_slug: CORE, available: 1 } } });
});

describe("commerce model mocks", () => {
  const admin = (path: string, method = "GET", body?: unknown) =>
    fetch(`${API_URL}/api/v1/admin${path}`, {
      method,
      headers: { Authorization: "Bearer tyt-admin-test-auth", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const buy = (slug: string, quantity = 1, email = "guest@example.com") => pay(email, [{ product_slug: slug, quantity }], crypto.randomUUID());
  afterEach(() => configureAdminMocks());

  it("sells a preorder with its limit, and snapshots the ship date on the order", async () => {
    configureAdminMocks("ok", "ok", { preorder: true });
    configureMocks({ state: "live", extras: { preorder: true } });
    const { product } = await api.product(PREORDER);
    expect(product).toMatchObject({ preorder: true, preorder_ships: PREORDER_SHIPS, per_customer_limit: 2, max_per_order: 2, availability: { state: "preorder", purchasable: true } });
    const { order } = await buy(PREORDER, 2);
    await admin(`/products/${PREORDER}`, "PATCH", { preorder_ships: "Ships in March 2027" });
    expect((await api.product(PREORDER)).product.preorder_ships).toBe("Ships in March 2027");
    expect((await api.order(order.token)).order.items[0].preorder_ships).toBe(PREORDER_SHIPS);
    await expect(buy(PREORDER)).rejects.toMatchObject({ body: { code: "limit_exceeded", message: "Hagåtña Sunrise is limited to 2 per customer." } });
  });

  it("holds a preorder back when the store is closed or the units run out", async () => {
    configureAdminMocks("ok", "ok", { preorder: true });
    configureMocks({ state: "live", extras: { preorder: true }, database: { stock: { [CORE]: 40, [MAP]: 100, [PREORDER]: 0 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 } });
    expect((await api.product(PREORDER)).product.availability).toMatchObject({ state: "sold_out", purchasable: false });
  });

  it("serves a drop's several products, lead first, and sells it out only when all are gone", async () => {
    configureAdminMocks("ok", "ok", { dropItems: 2 });
    configureMocks({ state: "live", extras: { dropItems: 2 }, database: { stock: { [CORE]: 40, [MAP]: 0, [MAP_NIGHT]: 1 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 } });
    const { drop } = await api.drop(DROP);
    expect(drop.products!.map((p) => p.slug)).toEqual([MAP, MAP_NIGHT]);
    expect(drop.state).toBe("live");
    expect((await api.storefront()).featured_drop!.products!.map((p) => p.slug)).toEqual([MAP, MAP_NIGHT]);
    await buy(MAP_NIGHT);
    expect((await api.drop(DROP)).drop.state).toBe("sold_out");
    expect((await api.drops()).archive.map((d) => d.slug)).toEqual([DROP]);
  });

  it("attaches a second product to a drop through the admin", async () => {
    configureAdminMocks();
    configureMocks({ state: "live" });
    const response = await admin(`/products/${CORE}`, "PATCH", { kind: "drop", drop_slug: DROP });
    expect(response.status).toBe(200);
    const { drops } = await (await admin("/drops")).json();
    expect(drops[0].products.map((p: { slug: string }) => p.slug)).toEqual([CORE, MAP]);
    expect((await api.drop(DROP)).drop.products!.map((p) => p.slug)).toEqual([CORE, MAP]);
    expect((await api.storefront()).core_products).toHaveLength(0);
  });

  it("leads with signature products", async () => {
    configureAdminMocks("ok", "ok", { preorder: true });
    configureMocks({ state: "upcoming", extras: { preorder: true } });
    await admin(`/products/${PREORDER}`, "PATCH", { signature: true });
    const { core_products } = await api.storefront();
    expect(core_products.map((p) => p.slug)).toEqual([PREORDER, CORE]);
    expect(core_products[0].signature).toBe(true);
  });

  it("runs production: add, edit, receive once, and cancel, with stock reaching the storefront", async () => {
    configureAdminMocks();
    configureMocks({ state: "upcoming", database: { stock: { [CORE]: 5, [MAP]: 100 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 } });
    expect((await api.product(CORE)).product.availability.remaining).toBe(5);
    const base = `/products/${CORE}/production_runs`;
    expect((await admin(base, "POST", { quantity: 0 })).status).toBe(422);
    const created = await admin(base, "POST", { quantity: 500, supplier: " Shenzhen ", unit_cost_cents: 720, expected_at: "2027-01-15" });
    expect(created.status).toBe(201);
    const { production_run: run } = await created.json();
    expect(run).toMatchObject({ status: "ordered", supplier: "Shenzhen", stock_added: null });
    expect((await (await admin(`${base}/${run.id}`, "PATCH", { quantity: 400 })).json()).production_run.quantity).toBe(400);
    expect((await admin(`${base}/${run.id}/receive`, "POST", { stock_added: 401 })).status).toBe(422);
    for (let i = 0; i < 2; i++) {
      const received = await (await admin(`${base}/${run.id}/receive`, "POST", { stock_added: 100 })).json();
      expect(received.production_run).toMatchObject({ status: "received", stock_added: 100 });
      expect(received.product.stock_quantity).toBe(140);
    }
    const { inventory_movements } = await (await admin(`/products/${CORE}/inventory_movements`)).json();
    expect(inventory_movements).toHaveLength(1);
    expect(inventory_movements[0]).toMatchObject({ delta: 100, reason: "production_received" });
    expect((await admin(`${base}/${run.id}/cancel`, "POST", {})).status).toBe(422);
    const second = (await (await admin(base, "POST", { quantity: 5 })).json()).production_run;
    expect((await (await admin(`${base}/${second.id}/cancel`, "POST", {})).json()).production_run.status).toBe("canceled");
    expect((await admin(`${base}/${second.id}/receive`, "POST", {})).status).toBe(422);
    const { production_runs } = await (await admin(base)).json();
    expect(production_runs.map((item: { id: number }) => item.id)).toEqual([second.id, run.id]);
    // The storefront's count moves too, so low stock no longer shows.
    expect((await api.product(CORE)).product.availability).toMatchObject({ remaining: null, low_stock: false });
  });
});
