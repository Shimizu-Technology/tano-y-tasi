import type { CartItem } from "./types";
export interface CheckoutAttempt {
  fingerprint: string;
  key: string;
  cartRevision: string;
  items: CartItem[];
  orderToken?: string;
}
export function checkoutFingerprint(email: string, items: CartItem[]) {
  return JSON.stringify({
    email: email.trim().toLowerCase(),
    items: [...items].sort((a, b) => a.product_slug.localeCompare(b.product_slug)),
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
