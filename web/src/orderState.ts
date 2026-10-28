import { useCart } from "./cart";
import type { CartItem, Order } from "./types";
export function rememberCheckout(token: string, items: CartItem[]) {
  localStorage.setItem(`tyt-order-cart-${token}`, JSON.stringify(items));
}
export function reconcileOrder(order: Order) {
  const key = `tyt-reconciled-${order.token}`;
  const previous = localStorage.getItem(key);
  if (previous === "paid") return;
  if (order.status === "paid") {
    const saved = localStorage.getItem(`tyt-order-cart-${order.token}`);
    if (saved) {
      try {
        useCart.getState().complete(JSON.parse(saved) as CartItem[]);
      } catch {
        /* The order remains readable if old local data was damaged. */
      }
    }
    localStorage.setItem(key, "paid");
  } else if (["canceled", "expired"].includes(order.status)) {
    if (previous) return;
    useCart.getState().restore(order.items);
    localStorage.setItem(key, order.status);
  } else return;
  localStorage.removeItem(`tyt-order-cart-${order.token}`);
  sessionStorage.removeItem("tyt-checkout-attempt");
}
