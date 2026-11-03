import { createContext, useContext } from "react";
import { API_URL } from "../api";

export type AdminUser = {
  id: number | string;
  email: string;
  name?: string | null;
  role?: string;
  active?: boolean;
  last_signed_in_at?: string | null;
};
export type Delivery = {
  id: number | string;
  kind: string;
  to: string;
  subject?: string;
  status: string;
  attempts: number;
  last_error?: string | null;
  sent_at?: string | null;
};
export type OrderSummary = {
  number: string;
  token: string;
  status: string;
  fulfillment_status: string;
  email: string;
  total_cents: number;
  currency: string;
  item_count: number;
  created_at: string;
  paid_at?: string | null;
};
export type OrderShipping = {
  name?: string | null;
  phone?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
};
export type OrderDetail = OrderSummary & {
  items: {
    product_slug?: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
    image?: unknown;
  }[];
  shipping?: OrderShipping | null;
  subtotal_cents: number;
  provider?: string;
  provider_payment_intent_id?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  fulfilled_at?: string | null;
  notes?: string | null;
  attention_reason?: string | null;
  refunded_cents?: number;
  refunded_at?: string | null;
  dispute_status?: string | null;
  email_deliveries: Delivery[];
};
export type AdminProduct = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  price_cents: number;
  status: string;
  position: number;
  currency: string;
  stock_quantity: number;
  kind: string;
  specs: Record<string, unknown>;
  includes: string[];
  art: { credit: string; story: string };
  placeholders: string[];
  images: { base: string; widths?: number[]; alt?: string }[];
  drop?: { slug: string; name: string } | null;
};
export type AdminDrop = {
  slug: string;
  name: string;
  state: string;
  release_at: string | null;
  closes_at: string | null;
  per_customer_limit: number;
  quantity: number;
  product?: { slug: string; name: string; stock_quantity: number };
};
export type Page<T extends string, V> = { page: number; pages: number; total: number } & Record<T, V[]>;
export type AdminErrorBody = {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
};
export class AdminApiError extends Error {
  constructor(
    public status: number,
    public body: AdminErrorBody
  ) {
    super(body.message);
  }
}
export type TokenGetter = () => Promise<string | null>;
export type AdminClient = <T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; csv?: boolean }
) => Promise<T>;
export function createAdminClient(getToken: TokenGetter): AdminClient {
  return async <T>(
    path: string,
    options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; csv?: boolean } = {}
  ) => {
    const token = await getToken();
    if (!token)
      throw new AdminApiError(401, { code: "unauthenticated", message: "Your session has expired." });
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/v1/admin${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: options.csv ? "text/csv" : "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new AdminApiError(0, { code: "network_error", message: "Could not reach the admin API." });
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: AdminErrorBody } | null;
      throw new AdminApiError(
        response.status,
        payload?.error ?? {
          message: response.status === 401 ? "Your session has expired." : "The request failed.",
        }
      );
    }
    return (options.csv ? await response.blob() : await response.json()) as T;
  };
}
export const AdminApiContext = createContext<AdminClient | null>(null);
export function useAdminApi() {
  const client = useContext(AdminApiContext);
  if (!client) throw new Error("Admin API is unavailable");
  return client;
}
export function authState(error: unknown): "expired" | "denied" | "retry" | "other" {
  if (!(error instanceof AdminApiError)) return "retry";
  if (error.status === 401) return "expired";
  if (error.status === 403) return "denied";
  if (error.status === 0 || error.status >= 500) return "retry";
  return "other";
}
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AdminApiError)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.body.details ?? {}))
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string"))
      result[key] = value.join(", ");
  return result;
}
export function formError(error: unknown, fallback = "Could not save changes.") {
  const fields = fieldErrors(error);
  return {
    fields,
    message:
      Object.keys(fields).length > 0
        ? ""
        : error instanceof AdminApiError
          ? error.body.message
          : error instanceof Error
            ? error.message
            : fallback,
  };
}
