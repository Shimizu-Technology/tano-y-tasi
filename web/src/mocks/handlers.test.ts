import { api, ApiError, API_URL } from "../api";
import { configureMocks } from "./handlers";
import { CORE, MAP, DROP } from "./data";
const items = [{ product_slug: MAP, quantity: 1 }];
const start = (email = "guest@example.com", key = crypto.randomUUID()) => api.checkout(email, items, key);
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
    api.checkout("a@example.com", [{ product_slug: MAP, quantity: 0 }], crypto.randomUUID())
  ).rejects.toMatchObject({ body: { code: "quantity_invalid" } });
  await expect(api.checkout("a@example.com", [], crypto.randomUUID())).rejects.toMatchObject({
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
