import { checkoutFix } from "./api";
import { catalog, CORE, MAP } from "./mocks/data";
import { dropItems, money, countdown, priceRange, purchaseState, releaseTimes, remainingMs, heroReleaseTime } from "./utils";
import type { DropState } from "./types";
it("formats the release date across the date line, Guam first", () => {
  const t = releaseTimes("2026-12-05T00:00:00Z");
  expect(t.guam).toBe("Sat, Dec 5, 10:00 AM ChST");
  expect(t.pacific).toBe("Fri, Dec 4, 4:00 PM PT");
  expect(t.hawaii).toBe("Fri, Dec 4, 2:00 PM HT");
});
it("accounts for Pacific daylight saving time", () => {
  expect(releaseTimes("2026-07-05T00:00:00Z").pacific).toContain("5:00 PM PT");
});
it.each([
  ["upcoming", "RELEASES DEC 5", true],
  ["live", "ADD TO CART", false],
  ["sold_out", "SOLD OUT", true],
  ["closed", "DROP CLOSED", true],
] as [DropState, string, boolean][])("maps %s to the correct button", (state, label, disabled) => {
  const p = catalog(state, { [CORE]: 40, [MAP]: state === "sold_out" ? 0 : 100 })[1];
  expect(purchaseState(p)).toEqual({ label, disabled });
});
it("corrects clock skew and only shows countdown in the last 48h", () => {
  const release = "2026-12-05T00:00:00Z";
  const ms = remainingMs(release, "2026-12-04T23:00:00Z", 1000, 2000);
  expect(ms).toBe(3599000);
  expect(countdown(ms)).toBe("00:59:59");
  expect(countdown(49 * 3600000)).toBeNull();
  expect(countdown(0)).toBeNull();
});
it.each(["sold_out", "drop_not_live", "unknown_product"])("offers removal for %s", (code) => {
  expect(checkoutFix({ code, message: "raw" }).remove).toBe(true);
});
it("uses the remaining email allowance when fixing a limit error", () => {
  expect(
    checkoutFix({ code: "limit_exceeded", message: "Limit", details: { limit: 2, already_purchased: 1 } }).quantity
  ).toBe(1);
});
it("offers the available stock and keeps unknown error messages", () => {
  expect(checkoutFix({ code: "insufficient_stock", message: "stock", details: { available: 1 } }).quantity).toBe(1);
  expect(checkoutFix({ code: "dependency", message: "Try again." })).toEqual({ message: "Try again." });
});

it.each([
  [3500, "$35"],
  [3495, "$34.95"],
  [3501, "$35.01"],
  [0, "$0"],
])("formats %i cents as %s", (cents, expected) => {
  expect(money(Number(cents))).toBe(expected);
});

it("keeps the hero release in Guam time across the date line", () => {
  expect(heroReleaseTime("2026-12-05T00:00:00Z")).toBe("Sat, Dec 5 · 10:00 AM ChST");
});
it("shows Coming soon, not a date, for a drop with no release date", () => {
  const product = catalog("upcoming", { [MAP]: 100 }).find((item) => item.slug === MAP)!;
  expect(purchaseState({ ...product, drop: { ...product.drop!, release_at: null } })).toEqual({ label: "COMING SOON", disabled: true });
});

it("sells a purchasable preorder as PREORDER, and keeps other states as they are", () => {
  const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  const preorder = { ...product, availability: { ...product.availability, state: "preorder" as const, purchasable: true } };
  expect(purchaseState(preorder)).toEqual({ label: "PREORDER", disabled: false });
  expect(purchaseState({ ...preorder, availability: { ...preorder.availability, state: "sold_out", purchasable: false } })).toEqual({ label: "SOLD OUT", disabled: true });
});
it("words the limit for any product, not just a drop", () => {
  expect(checkoutFix({ code: "limit_exceeded", message: "", details: { limit: 1, already_purchased: 1 } })).toEqual({
    message: "This item is limited to 1 per customer. You've already reached it with this email.",
    quantity: 0,
  });
});
it("lists a drop's items, falling back to the lead for an older API", () => {
  expect(dropItems({ product: "lead" })).toEqual(["lead"]);
  expect(dropItems({ product: "lead", products: [] })).toEqual(["lead"]);
  expect(dropItems({ product: "lead", products: ["lead", "next"] })).toEqual(["lead", "next"]);
});
it("shows one price, or where a range starts", () => {
  expect(priceRange([{ price_cents: 4500 }, { price_cents: 4500 }])).toBe("$45");
  expect(priceRange([{ price_cents: 5000 }, { price_cents: 4500 }])).toBe("From $45");
});
