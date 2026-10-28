import type { Product } from "./types";
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
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
  if (product.availability.purchasable) return { label: "ADD TO CART", disabled: false };
  const s = product.availability.state;
  return {
    label:
      s === "upcoming"
        ? `RELEASES ${releaseDate(product.drop!.release_at).toUpperCase()}`
        : s === "closed"
          ? "DROP CLOSED"
          : "SOLD OUT",
    disabled: true,
  };
}
export function remainingMs(release: string, serverTime: string, receivedAt: number, now = Date.now()) {
  return Date.parse(release) - (Date.parse(serverTime) + (now - receivedAt));
}
export function countdown(ms: number) {
  if (ms <= 0 || ms > 48 * 3600_000) return null;
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
