import { useCart } from "./cart";
import { reconcileOrder, rememberCheckout } from "./orderState";
import { readAttempt, saveAttempt } from "./checkoutState";
import { saveAddress } from "./shippingAddress";
import type { Order } from "./types";
const order = { token: "order-token", status: "paid", items: [{ product_slug: "core", quantity: 1 }] } as Order;
beforeEach(() => useCart.setState({ items: [] }));
it("reconciles a locally started paid order once across tab sessions", () => {
  useCart.getState().add("core", 1, 10);
  rememberCheckout(order.token, attempt());
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([]);
  useCart.getState().add("core", 2, 10);
  sessionStorage.clear();
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 2 }]);
});
it("keeps the address out of localStorage, and clears it from the tab once paid", () => {
  useCart.getState().add("core", 1, 10);
  const address = { name: "A", line1: "Secret Street", line2: "", city: "Hagåtña", state: "GU", postal_code: "96910", phone: "" };
  const shipping = { option: { quote: "q", label: "Standard", amount_cents: 800, estimate: null, kind: "flat" as const }, address };
  saveAddress(address);
  rememberCheckout(order.token, { ...attempt(), fingerprint: JSON.stringify({ address }), shipping });
  expect(JSON.stringify({ ...localStorage })).not.toContain("Secret Street");
  expect(sessionStorage.getItem("tyt-checkout-attempt")).toBeNull();
  reconcileOrder(order);
  expect(sessionStorage.getItem("tyt-shipping-address")).toBeNull();
});
it("does not clear a cart when viewing an unrelated paid order link", () => {
  useCart.getState().add("core", 1, 10);
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 1 }]);
});
it("restores a canceled order once without duplicating quantities", () => {
  reconcileOrder({ ...order, status: "canceled" });
  reconcileOrder({ ...order, status: "canceled" });
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 1 }]);
});

function attempt() {
  return {
    fingerprint: "cart",
    key: crypto.randomUUID(),
    cartRevision: useCart.getState().revision,
    items: useCart.getState().items,
  };
}
it("preserves a removed and re-added purchase on the first paid reconciliation", () => {
  useCart.getState().add("core", 1, 10);
  rememberCheckout(order.token, attempt());
  useCart.getState().remove("core");
  useCart.getState().add("core", 1, 10);
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 1 }]);
});
it.each(["paid", "canceled", "expired"] as const)(
  "preserves checkout B's key when reconciling order A as %s",
  (status) => {
    useCart.getState().add("core", 1, 10);
    const first = attempt();
    saveAttempt(first);
    rememberCheckout(order.token, first);
    useCart.getState().remove("core");
    useCart.getState().add("core", 1, 10);
    const second = { ...attempt(), orderToken: "order-b" };
    saveAttempt(second);
    reconcileOrder({ ...order, status });
    expect(readAttempt()).toEqual(second);
    expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 1 }]);
  }
);
it("clears only the matching order's attempt", () => {
  useCart.getState().add("core", 1, 10);
  saveAttempt(attempt());
  rememberCheckout(order.token, readAttempt()!);
  reconcileOrder(order);
  expect(readAttempt()).toBeNull();
});
it("preserves a newer cart persisted by another tab", () => {
  useCart.getState().add("core", 1, 10);
  rememberCheckout(order.token, attempt());
  localStorage.setItem(
    "tyt-cart-v1",
    JSON.stringify({ state: { items: [{ product_slug: "core", quantity: 2 }], revision: "another-tab" }, version: 0 })
  );
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 2 }]);
});

it("does not merge a canceled older order into a newer cart with a different quantity", () => {
  useCart.getState().add("core", 2, 10);
  const first = attempt();
  saveAttempt(first);
  rememberCheckout(order.token, first);
  useCart.getState().remove("core");
  useCart.getState().add("core", 1, 10);
  const second = { ...attempt(), orderToken: "order-b" };
  saveAttempt(second);
  const revision = useCart.getState().revision;
  reconcileOrder({ ...order, status: "canceled", items: [{ product_slug: "core", quantity: 2 }] } as Order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 1 }]);
  expect(useCart.getState().revision).toBe(revision);
  expect(readAttempt()).toEqual(second);
});

it("leaves an unchanged cart alone when its own checkout is canceled", () => {
  useCart.getState().add("core", 2, 10);
  rememberCheckout(order.token, attempt());
  const revision = useCart.getState().revision;
  reconcileOrder({ ...order, status: "expired", items: [{ product_slug: "core", quantity: 2 }] } as Order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 2 }]);
  expect(useCart.getState().revision).toBe(revision);
});

it("preserves a newer cart written by another tab when an older order is canceled", () => {
  useCart.getState().add("core", 2, 10);
  rememberCheckout(order.token, attempt());
  localStorage.setItem("tyt-cart-v1", JSON.stringify({ state: { items: [{ product_slug: "map", quantity: 1 }], revision: "other-tab" }, version: 0 }));
  reconcileOrder({ ...order, status: "canceled", items: [{ product_slug: "core", quantity: 2 }] } as Order);
  expect(useCart.getState().items).toEqual([{ product_slug: "map", quantity: 1 }]);
});

