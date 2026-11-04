import type { Product } from "./types";
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dropNumber = (n: number) => String(n).padStart(3, "0");
export function releaseTimes(iso: string) {
  const time = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  return {
    guam: `${time("Pacific/Guam")} ChST`,
    pacific: `${time("America/Los_Angeles")} PT`,
    hawaii: `${time("Pacific/Honolulu")} HT`,
  };
}
export function releaseDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Guam", month: "short", day: "numeric" }).format(
    new Date(iso)
  );
}
export function purchaseState(product: Product) {
  if (product.availability.purchasable) return { label: product.availability.state === "preorder" ? "PREORDER" : "ADD TO CART", disabled: false };
  const s = product.availability.state;
  return {
    label:
      s === "coming_soon"
        ? "COMING SOON"
        : s === "upcoming"
        ? product.drop?.release_at
          ? `RELEASES ${releaseDate(product.drop.release_at).toUpperCase()}`
          : "COMING SOON"
        : s === "closed"
          ? "DROP CLOSED"
          : "SOLD OUT",
    disabled: true,
  };
}
// Every product in a drop. An API that predates `products` sends the lead alone.
export function dropItems<T>(drop: { product: T; products?: T[] }): T[] {
  return drop.products?.length ? drop.products : [drop.product];
}
// One price when a drop's items share it, otherwise where they start.
export function priceRange(products: Pick<Product, "price_cents">[]) {
  const prices = products.map((product) => product.price_cents);
  const lowest = Math.min(...prices);
  return lowest === Math.max(...prices) ? money(lowest) : `From ${money(lowest)}`;
}
export function remainingMs(release: string, serverTime: string, receivedAt: number, now = Date.now()) {
  return Date.parse(release) - (Date.parse(serverTime) + (now - receivedAt));
}
export function countdown(ms: number) {
  if (ms <= 0 || ms > 48 * 3600_000) return null;
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function heroReleaseTime(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Guam", weekday: "short", month: "short", day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Guam", hour: "numeric", minute: "2-digit" }).format(date);
  return `${day} · ${time} ChST`;
}
