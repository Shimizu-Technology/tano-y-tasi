export type DropState = "upcoming" | "live" | "sold_out" | "closed";
export interface Art {
  role: string;
  alt: string;
  base: string;
  widths: number[];
  aspect: string;
}
export interface DropSummary {
  slug: string;
  number: number;
  name: string;
  state: DropState;
  release_at: string | null;
  closes_at: string | null;
  sold_out_at: string | null;
  quantity: number | null;
  per_customer_limit: number;
}
export interface Product {
  slug: string;
  name: string;
  kind: "core" | "drop";
  price_cents: number;
  currency: "USD";
  summary: string;
  specs: { piece_count?: number; finished_size?: string };
  availability: {
    state: "available" | "sold_out" | "upcoming" | "coming_soon" | "closed";
    purchasable: boolean;
    remaining: number | null;
    low_stock: boolean;
  };
  drop: DropSummary | null;
  image: Art;
  alt_image: Art | null;
}
export interface ProductDetail extends Product {
  description: string;
  specs: {
    piece_count: number;
    finished_size: string;
    box_size: string;
    material: string;
    cut: string;
    made_in: string;
  };
  includes: string[];
  art: { credit: string; story: string };
  per_customer_limit: number | null;
  max_per_order: number;
  images: Art[];
  placeholders: string[];
}
export interface Drop extends DropSummary {
  product: ProductDetail;
}
export interface StoreSettings {
  sales_open: boolean;
  contact_email: string;
  tagline: string;
  secondary_tagline: string;
  story: string;
  mission_lines: string[];
}
export interface StorePage {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
}
export interface Storefront {
  featured_drop: (DropSummary & { product: Product }) | null;
  core_products: Product[];
  store?: StoreSettings;
  server_time: string;
}
export interface DropList extends DropSummary {
  product: Product;
}
export interface Drops {
  current: DropList | null;
  upcoming: DropList[];
  archive: DropList[];
  server_time: string;
}
export interface CartItem {
  product_slug: string;
  quantity: number;
}
export type OrderStatus = "pending_payment" | "paid" | "expired" | "canceled" | "refunded" | "needs_attention";
export interface Order {
  token: string;
  number: string;
  status: OrderStatus;
  email_masked: string;
  items: (CartItem & { name: string; unit_price_cents: number; image: Art })[];
  subtotal_cents: number;
  total_cents: number;
  refunded_cents?: number;
  currency: "USD";
  created_at: string;
  paid_at: string | null;
  expires_at: string;
}
export interface CheckoutResult {
  order: Pick<Order, "token" | "number" | "status" | "expires_at">;
  payment_url: string;
}
export interface ErrorBody {
  code: string;
  message: string;
  details?: {
    product_slug?: string;
    available?: number;
    limit?: number;
    already_purchased?: number;
    release_at?: string | null;
    retry?: "same_key" | "new_checkout";
  };
}
