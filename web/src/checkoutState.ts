import type { CartItem, ShippingAddress, ShippingOption } from "./types";
export interface CheckoutShipping {
  option: ShippingOption;
  address: ShippingAddress;
}
export interface CheckoutAttempt {
  fingerprint: string;
  key: string;
  cartRevision: string;
  items: CartItem[];
  // A retry sends this exact choice, even if its quote has since expired: the
  // server has already priced that order. sessionStorage only, because of the address.
  shipping?: CheckoutShipping;
  orderToken?: string;
}
export function checkoutFingerprint(email: string, items: CartItem[], shipping: CheckoutShipping | null) {
  return JSON.stringify({
    email: email.trim().toLowerCase(),
    items: [...items].sort((a, b) => a.product_slug.localeCompare(b.product_slug)),
    // The choice, not its signed token: re-quoting the same option mustn't start a new checkout.
    shipping: shipping && { kind: shipping.option.kind, label: shipping.option.label, amount_cents: shipping.option.amount_cents, address: shipping.address },
  });
}
export function readAttempt(): CheckoutAttempt | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem("tyt-checkout-attempt") || "null");
    return typeof saved?.key === "string" &&
      typeof saved.fingerprint === "string" &&
      typeof saved.cartRevision === "string" &&
      Array.isArray(saved.items)
      ? saved
      : null;
  } catch {
    return null;
  }
}
export function saveAttempt(attempt: CheckoutAttempt) {
  sessionStorage.setItem("tyt-checkout-attempt", JSON.stringify(attempt));
}
export function clearAttempt(key?: string) {
  if (key && readAttempt()?.key === key) sessionStorage.removeItem("tyt-checkout-attempt");
}
