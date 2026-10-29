import type {
  CartItem,
  CheckoutResult,
  Drop,
  Drops,
  ErrorBody,
  Order,
  ProductDetail,
  Product,
  Storefront,
} from "./types";
export const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://tano-y-tasi-api.onrender.com" : "http://localhost:3031")).replace(/\/$/, "");
export class ApiError extends Error {
  body: ErrorBody;
  status: number;
  constructor(body: ErrorBody, status: number) {
    super(body.message);
    this.body = body;
    this.status = status;
  }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error ?? { code: "unknown", message: "Something went wrong. Please try again." },
      response.status
    );
  return data as T;
}
export const api = {
  storefront: () => request<Storefront>("/storefront"),
  products: (kind?: string) => request<{ products: Product[] }>(`/products${kind ? `?kind=${kind}` : ""}`),
  product: (slug: string) =>
    request<{ product: ProductDetail; server_time: string }>(`/products/${encodeURIComponent(slug)}`),
  drops: () => request<Drops>("/drops"),
  drop: (slug: string) => request<{ drop: Drop; server_time: string }>(`/drops/${encodeURIComponent(slug)}`),
  checkout: (email: string, items: CartItem[], key: string) =>
    request<CheckoutResult>("/checkout", { email, items, idempotency_key: key }),
  order: (token: string) => request<{ order: Order }>(`/orders/${encodeURIComponent(token)}`),
  cancel: (token: string) => request<{ order: Order }>(`/orders/${encodeURIComponent(token)}/cancel`, {}),
  simulated: (token: string, action: "complete" | "cancel") =>
    request<{ order: Order }>(`/simulated_payments/${encodeURIComponent(token)}/${action}`, {}),
  subscribe: (email: string, source: string, drop_slug?: string) =>
    request<{ subscribed: true }>("/subscribers", { email, source, ...(drop_slug ? { drop_slug } : {}) }),
};
export function checkoutFix(error: ErrorBody): { message: string; quantity?: number; remove?: boolean } {
  switch (error.code) {
    case "limit_exceeded": {
      const limit = error.details?.limit ?? 2;
      const left = Math.max(0, limit - (error.details?.already_purchased ?? 0));
      const allowance = left === 0
        ? "You've already reached it with this email."
        : `You can order ${left} more with this email.`;
      return { message: `This drop is limited to ${limit} per customer. ${allowance}`, quantity: left };
    }
    case "insufficient_stock":
      return { message: `Only ${error.details?.available ?? 0} available.`, quantity: error.details?.available ?? 0 };
    case "sold_out":
      return { message: "This item has sold out.", remove: true };
    case "drop_not_live":
      return { message: "This drop is not available to buy yet.", remove: true };
    case "unknown_product":
      return { message: "This item is no longer available.", remove: true };
    default:
      return { message: error.message };
  }
}

// The snapshot is data-only JSON; it never needs an inline executable script.
export function restoreInitialData(client: import("@tanstack/react-query").QueryClient, doc: Document = document) {
  const element = doc.getElementById("tyt-initial-data");
  try {
    if (!element?.textContent) return;
    const data = JSON.parse(element.textContent) as import("../netlify/lib/storefront").InitialData;
    if (data.pathname !== window.location.pathname || !Number.isFinite(data.snapshotTime) || !data.storefront) return;
    const seed = (key: string[], value: unknown) => {
      // Render immediately, then refresh stock/lifecycle in the background, even for a fresh snapshot.
      client.setQueryDefaults(key, { staleTime: 0 });
      client.setQueryData(key, value, { updatedAt: data.snapshotTime });
    };
    seed(["storefront"], data.storefront);
    if (data.product) seed(["product", data.product.product.slug], data.product);
    if (data.drops) seed(["drops"], data.drops);
    if (data.drop) {
      const slug = data.pathname.replace(/\/$/, "").split("/")[2] ?? "featured";
      seed(["drop", slug], data.drop);
    }
  } catch {
    // A malformed or older snapshot must retain the normal client-fetch path.
  } finally {
    element?.remove();
  }
}
