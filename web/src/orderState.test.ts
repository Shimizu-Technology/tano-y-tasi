import { useCart } from "./cart";
import { reconcileOrder, rememberCheckout } from "./orderState";
import type { Order } from "./types";
const order = { token: "order-token", status: "paid", items: [{ product_slug: "core", quantity: 1 }] } as Order;
beforeEach(() => useCart.setState({ items: [] }));
it("reconciles a locally started paid order once across tab sessions", () => {
  useCart.getState().add("core", 1, 10);
  rememberCheckout(order.token, order.items);
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([]);
  useCart.getState().add("core", 2, 10);
  sessionStorage.clear();
  reconcileOrder(order);
  expect(useCart.getState().items).toEqual([{ product_slug: "core", quantity: 2 }]);
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
