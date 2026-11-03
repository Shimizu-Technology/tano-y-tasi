export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/admin";
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin && /^\/admin(?:\/|$)/.test(parsed.pathname)
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/admin";
  } catch {
    return "/admin";
  }
}
export function signInPath(path: string) {
  return `/admin/sign-in?returnTo=${encodeURIComponent(safeReturnPath(path))}`;
}
export const attentionReasons: Record<string, string> = {
  amount_mismatch: "Stripe charged an amount that doesn't match this order.",
  session_mismatch: "This payment came from a different Stripe checkout than the order expected.",
  store_closed: "This payment arrived after the store was closed.",
  drop_withdrawn: "This payment arrived after the drop was moved back to Coming soon.",
  customer_limit_exceeded: "This payment would put the customer over the drop's limit.",
  stock_unavailable: "This late payment arrived after the stock was gone.",
  refund_failed: "A refund on this order failed at Stripe, so the customer still hasn't been paid back.",
};
export function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}
export function dollarsToCents(value: string): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars, fractional = ""] = value.trim().split(".");
  const cents = Number(dollars) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export function guamInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(Date.parse(iso) + 10 * 3600_000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
export function guamToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== value) return null;
  return new Date(date.getTime() - 10 * 3600_000).toISOString();
}
export function datePreview(iso: string | null, zone: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}
export function validateProduct(value: { name: string; price: string; summary: string; description: string }) {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = "Name is required.";
  if (!value.summary.trim()) errors.summary = "Summary is required.";
  if (!value.description.trim()) errors.description = "Description is required.";
  if (dollarsToCents(value.price) === null)
    errors.price = "Enter a valid dollar amount with up to two decimals.";
  return errors;
}
export function validateDrop(value: {
  name: string;
  release: string;
  closes: string;
  limit: number;
  quantity: number;
}) {
  const errors: Record<string, string> = {};
  const release = value.release ? guamToIso(value.release) : null,
    closes = value.closes ? guamToIso(value.closes) : null;
  if (!value.name.trim()) errors.name = "Name is required.";
  if (value.release && !release) errors.release_at = "Enter a valid Guam release time.";
  if (value.closes && !closes) errors.closes_at = "Enter a valid Guam close time.";
  if (closes && !value.release) errors.closes_at = "Set a release time before a close time.";
  if (release && closes && release > closes) errors.closes_at = "Close must follow release.";
  if (!Number.isInteger(value.limit) || value.limit < 1)
    errors.per_customer_limit = "Enter a limit of at least 1.";
  if (!Number.isInteger(value.quantity) || value.quantity < 0)
    errors.quantity = "Enter a nonnegative whole number.";
  return errors;
}
