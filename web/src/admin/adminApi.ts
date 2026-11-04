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
  fulfillment_method?: "ship" | "pickup";
  email: string;
  total_cents: number;
  currency: string;
  item_count: number;
  preorder_item_count?: number;
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
    preorder_ships?: string | null;
  }[];
  shipping?: OrderShipping | null;
  subtotal_cents: number;
  shipping_cents?: number;
  tax_cents?: number;
  shipping_method?: {
    label?: string | null;
    carrier?: string | null;
    service?: string | null;
    kind?: string | null;
    estimate?: string | null;
    instructions?: string | null;
    cost_cents?: number | null;
  } | null;
  label_status?: "buying" | "bought" | null;
  label_url?: string | null;
  label_cost_cents?: number | null;
  label_bought_at?: string | null;
  label_available?: boolean;
  tracking_status?: string | null;
  tracking_status_at?: string | null;
  provider?: string;
  provider_payment_intent_id?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  fulfilled_at?: string | null;
  notes?: string | null;
  attention_reason?: string | null;
  charged_cents?: number | null;
  refunded_cents?: number;
  open_refund_cents?: number | null;
  refunded_at?: string | null;
  dispute_status?: string | null;
  email_deliveries: Delivery[];
};
export type AdminImage = { role: string; alt: string; base: string; widths: number[]; aspect: string };
export type UploadGrant = {
  base: string;
  uploads: { width: number; url: string; headers: Record<string, string> }[];
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
  signature: boolean;
  per_customer_limit: number | null;
  preorder: boolean;
  preorder_ships: string | null;
  weight_oz?: number | null;
  length_in?: number | null;
  width_in?: number | null;
  height_in?: number | null;
  specs: Record<string, unknown>;
  includes: string[];
  art: { credit: string; story: string };
  placeholders: string[];
  images: AdminImage[];
  drop?: { slug: string; name: string; number?: number; per_customer_limit?: number; products?: DropMember[] } | null;
};
export type DropMember = { slug: string; name: string; stock_quantity: number; status?: string };
export type ProductionRun = {
  id: number | string;
  quantity: number;
  status: "ordered" | "received" | "canceled";
  supplier: string | null;
  unit_cost_cents: number | null;
  expected_at: string | null;
  received_at: string | null;
  stock_added: number | null;
  notes: string | null;
  created_at: string;
};
export type AdminDrop = {
  slug: string;
  number: number;
  name: string;
  state: string;
  release_at: string | null;
  closes_at: string | null;
  per_customer_limit: number;
  quantity: number;
  product?: DropMember | null;
  products?: DropMember[];
  // The server's answer, counting only products on sale: a preview can't work this out from stock alone.
  out_of_stock?: boolean;
};
export type StoreSettings = {
  sales_open: boolean;
  contact_email: string;
  tagline: string;
  secondary_tagline: string;
  story: string;
  mission_lines: string[];
  payment_mode: "stripe_live" | "stripe_test" | "simulated";
  shipping_placeholders?: boolean;
};
export type ShippingSettings = {
  mode: "flat" | "easypost";
  carriers: string[];
  handling_fee_cents: number;
  free_shipping_threshold_cents: number | null;
  flat_rates: { mainland: number; alaska_hawaii: number; guam_cnmi: number; territories: number; military: number };
  flat_rates_placeholder: boolean;
  pickup_enabled: boolean;
  pickup_instructions: string;
  origin: Record<string, string>;
  origin_complete: boolean;
  parcel: Record<string, number>;
  customs: Record<string, string>;
  tax_enabled: boolean;
  easypost_configured: boolean;
  easypost_webhook_configured: boolean;
};
export type AdminPage = { slug: string; title: string; body: string; updated_at: string };
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
  // A named failure in one feature (image storage, the payment provider) belongs on that
  // screen. Taking over the whole admin would throw away the work in front of the merchant.
  if (error.status >= 500 && error.body.code && error.body.code !== "identity_unavailable") return "other";
  if (error.status === 0 || error.status >= 500) return "retry";
  return "other";
}
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AdminApiError)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.body.details ?? {}))
    if (typeof value === "string") result[key] = sentence(value);
    else if (Array.isArray(value) && value.every((item) => typeof item === "string"))
      result[key] = sentence(value.join(", "));
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
