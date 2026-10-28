import { useCart } from "./cart";
import { clearAttempt, readAttempt, saveAttempt } from "./checkoutState";
import type { CheckoutAttempt } from "./checkoutState";
import type { Order } from "./types";
export function rememberCheckout(token: string, attempt: CheckoutAttempt) {
  const snapshot = { ...attempt, orderToken: token };
  localStorage.setItem(`tyt-order-cart-${token}`, JSON.stringify(snapshot));
  if (readAttempt()?.key === attempt.key) saveAttempt(snapshot);
}
export function reconcileOrder(order: Order) {
  const key = `tyt-reconciled-${order.token}`;
  const previous = localStorage.getItem(key);
  if (previous === "paid") return;
  let snapshot: CheckoutAttempt | null = null;
  try {
    snapshot = JSON.parse(localStorage.getItem(`tyt-order-cart-${order.token}`) || "null");
  } catch {
    /* Damaged or legacy snapshots cannot establish cart identity. */
  }
  if (order.status === "paid") {
    // Refresh persisted state first so a newer cart from another tab is preserved too.
    void useCart.persist.rehydrate();
    if (snapshot?.cartRevision === useCart.getState().revision) useCart.getState().clear();
    localStorage.setItem(key, "paid");
  } else if (["canceled", "expired"].includes(order.status)) {
    if (previous) return;
    useCart.getState().restore(order.items);
    localStorage.setItem(key, order.status);
  } else return;
  localStorage.removeItem(`tyt-order-cart-${order.token}`);
  const current = readAttempt();
  if (current?.orderToken === order.token || (snapshot?.key && current?.key === snapshot.key))
    clearAttempt(current?.key);
}
