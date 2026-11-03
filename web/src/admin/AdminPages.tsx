import { useCallback, useEffect, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useLocation, useNavigate } from "react-router";
import { Check, Download, ExternalLink, Plus, RefreshCw } from "lucide-react";
import {
  fieldErrors,
  formError,
  useAdminApi,
  type AdminDrop,
  type AdminProduct,
  type AdminUser,
  type Delivery,
  type OrderDetail,
  type OrderShipping,
  type OrderSummary,
  type Page,
} from "./adminApi";
import {
  centsToDollars,
  datePreview,
  dollarsToCents,
  guamInput,
  guamToIso,
  validateDrop,
  validateProduct,
  attentionReasons,
} from "./adminUtils";

type Resource<T> = { data: T | null; error: string; loading: boolean; reload: () => void };
function useResource<T>(path: string): Resource<T> {
  const api = useAdminApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    api<T>(path)
      .then((result) => {
        if (current) {
          setData(result);
          setError("");
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (current) {
          setError(cause instanceof Error ? cause.message : "Could not load data.");
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [api, path, revision]);
  return {
    data,
    error,
    loading,
    reload: () => {
      setLoading(true);
      setRevision((n) => n + 1);
    },
  };
}
function Result<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (resource.loading && !resource.data)
    return (
      <p role="status" className="admin-loading">
        Loading…
      </p>
    );
  if (resource.error && !resource.data)
    return (
      <div role="alert" className="admin-panel">
        <p>{resource.error}</p>
        <button className="admin-button" onClick={resource.reload}>
          Retry
        </button>
      </div>
    );
  return resource.data ? <>{children(resource.data)}</> : <p>No data available.</p>;
}
function Heading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="admin-heading">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}
function Chip({ value }: { value?: string | null }) {
  return (
    <span className={`admin-chip ${value?.replace(/[^a-z]/g, "-") ?? ""}`}>
      {value?.replaceAll("_", " ") ?? "—"}
    </span>
  );
}
function Money({ cents }: { cents: number }) {
  return <span className="admin-number">${centsToDollars(cents)}</span>;
}
function DateText({ value }: { value?: string | null }) {
  return <>{value ? datePreview(value, "Pacific/Guam") : "—"}</>;
}
function Notice({ text, kind = "success" }: { text: string; kind?: "success" | "error" }) {
  return text ? (
    <p role={kind === "error" ? "alert" : "status"} className={`admin-notice ${kind}`}>
      {kind === "success" && <Check size={16} />}
      {text}
    </p>
  ) : null;
}
function Field({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  min,
  required = false,
}: {
  label: string;
  name: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  min?: number;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        required={required}
      />
      {error && <small id={`${name}-error`}>{error}</small>}
    </label>
  );
}
function TextArea({
  label,
  name,
  value,
  onChange,
  error,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <textarea
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        rows={4}
        required={required}
      />
      {error && <small id={`${name}-error`}>{error}</small>}
    </label>
  );
}
function useUnsaved(dirty: boolean) {
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      [dirty]
    )
  );
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("Discard unsaved changes?")) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
}
function issue(error: unknown, fallback = "Could not save changes.") {
  return error instanceof Error ? error.message : fallback;
}
function backPath(search: string, section: string) {
  const value = new URLSearchParams(search).get("from");
  return value?.startsWith(`/admin/${section}`) && !value.startsWith("//") ? value : `/admin/${section}`;
}

type SpecRow = {
  key: string;
  value: string;
  // "json" covers objects, arrays and null: edited as JSON text so structured
  // values round-trip instead of becoming "[object Object]".
  originalType: "string" | "number" | "boolean" | "json";
};
export function specType(value: unknown): SpecRow["originalType"] {
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return typeof value as SpecRow["originalType"];
  return "json";
}
export function parseJsonSpec(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
type ProductForm = {
  name: string;
  summary: string;
  description: string;
  price: string;
  status: string;
  position: number;
  specs: SpecRow[];
  includes: string;
  credit: string;
  story: string;
  placeholders: string;
};
export function productForm(product: AdminProduct): ProductForm {
  return {
    name: product.name,
    summary: product.summary,
    description: product.description,
    price: centsToDollars(product.price_cents),
    status: product.status,
    position: product.position,
    specs: Object.entries(product.specs ?? {}).map(([key, value]) => ({
      key,
      value: specType(value) === "json" ? JSON.stringify(value) : String(value),
      originalType: specType(value),
    })),
    includes: (product.includes ?? []).join("\n"),
    credit: product.art?.credit ?? "",
    story: product.art?.story ?? "",
    placeholders: (product.placeholders ?? []).join("\n"),
  };
}
function lineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
export function specsObject(rows: SpecRow[]) {
  return Object.fromEntries(
    rows
      .filter((row) => row.key.trim())
      .map((row) => {
        let value: unknown = row.value;
        if (row.originalType === "number") value = Number(row.value);
        if (row.originalType === "boolean") value = row.value === "true";
        if (row.originalType === "json") {
          const parsed = parseJsonSpec(row.value);
          value = parsed.ok ? parsed.value : row.value;
        }
        return [row.key.trim(), value];
      })
  );
}
export function productPatch(form: ProductForm, initial: ProductForm) {
  const patch: Record<string, unknown> = {};
  const add = (key: string, value: unknown, baseline: unknown) => {
    if (JSON.stringify(value) !== JSON.stringify(baseline)) patch[key] = value;
  };
  add("name", form.name.trim(), initial.name.trim());
  add("summary", form.summary.trim(), initial.summary.trim());
  add("description", form.description.trim(), initial.description.trim());
  add("price_cents", dollarsToCents(form.price), dollarsToCents(initial.price));
  add("status", form.status, initial.status);
  add("position", Number(form.position), Number(initial.position));
  add("specs", specsObject(form.specs), specsObject(initial.specs));
  add("includes", lineList(form.includes), lineList(initial.includes));
  add(
    "art",
    { credit: form.credit, story: form.story },
    { credit: initial.credit, story: initial.story }
  );
  add("placeholders", lineList(form.placeholders), lineList(initial.placeholders));
  return patch;
}
type DropForm = {
  name: string;
  release: string;
  closes: string;
  limit: number;
  quantity: number;
};
function dropForm(drop: AdminDrop): DropForm {
  return {
    name: drop.name,
    release: guamInput(drop.release_at),
    closes: guamInput(drop.closes_at),
    limit: drop.per_customer_limit,
    quantity: drop.quantity,
  };
}
function dropPatch(form: DropForm, initial: DropForm) {
  const patch: Record<string, unknown> = {};
  if (form.name.trim() !== initial.name.trim()) patch.name = form.name.trim();
  if (form.release !== initial.release) patch.release_at = form.release ? guamToIso(form.release) : null;
  if (form.closes !== initial.closes) patch.closes_at = form.closes ? guamToIso(form.closes) : null;
  if (Number(form.limit) !== Number(initial.limit)) patch.per_customer_limit = Number(form.limit);
  if (Number(form.quantity) !== Number(initial.quantity)) patch.quantity = Number(form.quantity);
  return patch;
}

export function ShippingAddress({ shipping }: { shipping?: OrderShipping | null }) {
  const address = shipping?.address;
  const locality = [address?.city, address?.state, address?.postal_code].filter(Boolean).join(", ");
  const lines = [address?.line1, address?.line2, locality, address?.country].filter(
    (value): value is string => !!value
  );
  if (!shipping?.name && !shipping?.phone && lines.length === 0)
    return <p>No shipping address recorded.</p>;
  return (
    <address className="admin-shipping-address">
      {shipping?.name && <strong>{shipping.name}</strong>}
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>{line}</span>
      ))}
      {shipping?.phone && <span>{shipping.phone}</span>}
    </address>
  );
}

export function DashboardPage() {
  type Dashboard = {
    orders: {
      paid_count: number;
      paid_total_cents: number;
      unfulfilled_count: number;
      needs_attention_count: number;
    };
    recent_orders: OrderSummary[];
    featured_drop: (AdminDrop & { product?: { slug: string; name: string; stock_quantity: number } }) | null;
    low_stock: { slug: string; name: string; stock_quantity: number }[];
    subscribers_count: number;
  };
  const resource = useResource<Dashboard>("/dashboard");
  return (
    <>
      <Heading
        eyebrow="OVERVIEW"
        title="Dashboard"
        action={
          <button className="admin-text-button" onClick={resource.reload}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />
      <Result resource={resource}>
        {(data) => (
          <>
            <div className="admin-kpis">
              <div>
                <span>Paid orders</span>
                <strong>{data.orders.paid_count}</strong>
              </div>
              <div>
                <span>Paid revenue</span>
                <strong>
                  <Money cents={data.orders.paid_total_cents} />
                </strong>
              </div>
              <div>
                <span>Unfulfilled</span>
                <strong>{data.orders.unfulfilled_count}</strong>
              </div>
              <div>
                <span>Needs attention</span>
                <strong>{data.orders.needs_attention_count}</strong>
              </div>
              <div>
                <span>Subscribers</span>
                <strong>{data.subscribers_count}</strong>
              </div>
            </div>
            <div className="admin-dashboard-grid">
              <section className="admin-panel">
                <div className="admin-section-head">
                  <h2>Recent orders</h2>
                  <Link to="/admin/orders">All orders →</Link>
                </div>
                <OrderRows orders={data.recent_orders} listPath="/admin" />
              </section>
              <section className="admin-panel">
                <h2>Featured drop</h2>
                {data.featured_drop ? (
                  <div className="admin-featured">
                    <Link to={`/admin/drops/${encodeURIComponent(data.featured_drop.slug)}`}>
                      {data.featured_drop.name}
                    </Link>
                    <Chip value={data.featured_drop.state} />
                    <p>
                      {data.featured_drop.product?.stock_quantity ?? 0} in stock ·{" "}
                      {data.featured_drop.quantity} announced
                    </p>
                  </div>
                ) : (
                  <p>No featured drop.</p>
                )}
                <h2 className="admin-subheading">Low stock</h2>
                {data.low_stock.length ? (
                  data.low_stock.map((product) => (
                    <p key={product.slug}>
                      <Link to={`/admin/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link> ·{" "}
                      {product.stock_quantity} left
                    </p>
                  ))
                ) : (
                  <p>No low-stock products.</p>
                )}
              </section>
            </div>
          </>
        )}
      </Result>
    </>
  );
}
function OrderRows({ orders, listPath }: { orders: OrderSummary[]; listPath: string }) {
  return orders.length ? (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Fulfillment</th>
              <th>Total</th>
              <th>Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.number}>
                <td>
                  <Link
                    to={`/admin/orders/${encodeURIComponent(order.number)}?from=${encodeURIComponent(listPath)}`}
                  >
                    {order.number}
                  </Link>
                </td>
                <td>{order.email}</td>
                <td>
                  <Chip value={order.status} />
                </td>
                <td>
                  <Chip value={order.fulfillment_status} />
                </td>
                <td>
                  <Money cents={order.total_cents} />
                </td>
                <td>
                  <DateText value={order.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-cards">
        {orders.map((order) => (
          <Link
            className="admin-card"
            key={order.number}
            to={`/admin/orders/${encodeURIComponent(order.number)}?from=${encodeURIComponent(listPath)}`}
          >
            <div>
              <strong>{order.number}</strong>
              <Money cents={order.total_cents} />
            </div>
            <p>{order.email}</p>
            <div>
              <Chip value={order.status} />
              <Chip value={order.fulfillment_status} />
            </div>
            <small>
              <DateText value={order.created_at} />
            </small>
          </Link>
        ))}
      </div>
    </>
  ) : (
    <p>No orders found.</p>
  );
}
export function OrdersPage() {
  const location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const path = `/orders?${params.toString()}`;
  const resource = useResource<Page<"orders", OrderSummary>>(path);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    navigate(`/admin/orders?${next.toString()}`);
  };
  return (
    <>
      <Heading eyebrow="OPERATIONS" title="Orders" />
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          change("q", search.trim());
        }}
      >
        <label>
          <span>Search number or email</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button className="admin-button">Search</button>
        <label>
          <span>Status</span>
          <select
            aria-label="Status"
            value={params.get("status") ?? ""}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {["pending_payment", "paid", "expired", "canceled", "refunded", "needs_attention"].map(
              (value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              )
            )}
          </select>
        </label>
        <label>
          <span>Fulfillment</span>
          <select
            aria-label="Fulfillment"
            value={params.get("fulfillment") ?? ""}
            onChange={(event) => change("fulfillment", event.target.value)}
          >
            <option value="">All fulfillment</option>
            <option value="unfulfilled">Unfulfilled</option>
            <option value="fulfilled">Fulfilled</option>
          </select>
        </label>
      </form>
      <Result resource={resource}>
        {(data) => (
          <>
            <p className="admin-count">{data.total} {data.total === 1 ? "order" : "orders"}</p>
            <OrderRows orders={data.orders} listPath={`${location.pathname}${location.search}`} />
            <Pagination
              page={data.page}
              pages={data.pages}
              onPage={(page) => {
                const next = new URLSearchParams(location.search);
                next.set("page", String(page));
                navigate(`?${next}`);
              }}
            />
          </>
        )}
      </Result>
    </>
  );
}
function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return pages > 1 ? (
    <div className="admin-pagination">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  ) : null;
}
export function OrderPage() {
  const location = useLocation(),
    number = location.pathname.split("/")[3];
  const resource = useResource<{ order: OrderDetail }>(`/orders/${encodeURIComponent(number ?? "")}`);
  return (
    <>
      <Link className="admin-back" to={backPath(location.search, "orders")}>
        ← Orders
      </Link>
      <Result resource={resource}>
        {(data) => <OrderEditor key={data.order.number} order={data.order} reload={resource.reload} />}
      </Result>
    </>
  );
}
function OrderEditor({ order, reload }: { order: OrderDetail; reload: () => void }) {
  const api = useAdminApi();
  const [notes, setNotes] = useState(order.notes ?? "");
  const [tracking, setTracking] = useState(order.tracking_number ?? "");
  const [url, setUrl] = useState(order.tracking_url ?? "");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = notes !== (order.notes ?? "");
  useUnsaved(
    (dirty || tracking !== (order.tracking_number ?? "") || url !== (order.tracking_url ?? "") || !notify) &&
      !saving
  );
  const endpoint = `/orders/${encodeURIComponent(order.number)}`;
  const refunded = order.refunded_cents ?? 0;
  const refundable = ["paid", "needs_attention"].includes(order.status) && order.paid_at ? (order.charged_cents ?? order.total_cents) - refunded : 0;
  const openRefund = order.open_refund_cents ?? null;
  // Empty until edited, so the field follows the balance after each refund.
  const [refundDraft, setRefundDraft] = useState<string | null>(null);
  const refund = refundDraft ?? centsToDollars(openRefund ?? refundable);
  async function perform(path: string, method: "POST" | "PATCH", body?: unknown) {
    setSaving(true);
    setFailure("");
    setMessage("");
    try {
      await api(path, { method, body });
      setMessage("Changes saved.");
      reload();
    } catch (cause) {
      setFailure(issue(cause));
      setErrors(fieldErrors(cause));
    } finally {
      setSaving(false);
    }
  }
  async function resend(delivery: Delivery) {
    if (!window.confirm(`Resend ${delivery.kind.replaceAll("_", " ")} to ${delivery.to}?`)) return;
    await perform(`${endpoint}/email_deliveries/${delivery.id}/resend`, "POST", {});
  }
  return (
    <>
      <Heading
        eyebrow="ORDER DETAIL"
        title={order.number}
        action={
          <>
            <Chip value={order.status} />
            <Chip value={order.fulfillment_status} />
          </>
        }
      />
      <Notice text={message} />
      <Notice text={failure} kind="error" />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Items</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={`${item.product_slug ?? item.name}-${index}`}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>
                      <Money cents={item.unit_price_cents} />
                    </td>
                    <td>
                      <Money cents={item.unit_price_cents * item.quantity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-total">
            Total <Money cents={order.total_cents} />
          </p>
          <h2 className="admin-subheading">Customer and shipping</h2>
          <p>{order.email}</p>
          <ShippingAddress shipping={order.shipping} />
          <h2 className="admin-subheading">Payment</h2>
          {(order.status === "needs_attention" || order.attention_reason) && (
            <div className="admin-attention" role="alert">
              <strong>This payment needs your review.</strong>
              <p>{attentionReasons[order.attention_reason ?? ""] ?? "Check this payment in Stripe."} Refund it{order.status === "needs_attention" && ", or mark it paid if you'll ship it"}.</p>
              {order.status === "needs_attention" && (
                <button
                  className="admin-button secondary"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm("Mark this order paid? Anything not yet shipped comes out of stock, and the customer gets their confirmation."))
                      void perform(`${endpoint}/mark_paid`, "POST", {});
                  }}
                >
                  Mark paid
                </button>
              )}
            </div>
          )}
          {openRefund !== null && (
            <p className="admin-attention" role="alert">
              <strong>A <Money cents={openRefund} /> refund hasn't been confirmed by Stripe.</strong> Retry it below. It won't refund twice.
            </p>
          )}
          {order.dispute_status && (
            <p className="admin-attention" role="alert">
              <strong>Payment dispute: {order.dispute_status.replaceAll("_", " ")}.</strong> Respond in the Stripe dashboard.
            </p>
          )}
          <dl className="admin-meta">
            <dt>Provider</dt>
            <dd>{order.provider ?? "—"}</dd>
            <dt>Payment intent</dt>
            <dd>{order.provider_payment_intent_id ?? "—"}</dd>
            <dt>Paid</dt>
            <dd>
              <DateText value={order.paid_at} />
            </dd>
            <dt>Refunded</dt>
            <dd>
              <Money cents={refunded} />
            </dd>
          </dl>
          {(refundable > 0 || openRefund !== null) && (
            <>
              <Field
                label={`Refund amount (USD), up to ${centsToDollars(refundable)}`}
                name="amount_cents"
                value={refund}
                onChange={setRefundDraft}
                error={errors.amount_cents}
              />
              <button
                className="admin-button secondary"
                disabled={saving}
                onClick={() => {
                  const cents = dollarsToCents(refund);
                  if (cents === null || cents < 1 || (openRefund === null && cents > refundable)) {
                    setFailure(`Enter a refund between $0.01 and $${centsToDollars(refundable)}.`);
                    return;
                  }
                  if (window.confirm(`Refund $${centsToDollars(cents)} to the customer? This can't be undone.`)) {
                    setRefundDraft(null);
                    void perform(`${endpoint}/refund`, "POST", { amount_cents: cents });
                  }
                }}
              >
                Refund
              </button>
              <p className="admin-help">A full refund of an unshipped order puts its items back in stock.</p>
            </>
          )}
        </section>
        <section className="admin-panel">
          <h2>Notes</h2>
          <TextArea
            label="Internal notes"
            name="notes"
            value={notes}
            onChange={setNotes}
            error={errors.notes}
          />
          <button
            className="admin-button"
            disabled={saving || !dirty}
            onClick={() => void perform(endpoint, "PATCH", { notes })}
          >
            {saving ? "Saving…" : "Save notes"}
          </button>
          <h2 className="admin-subheading">Fulfillment</h2>
          {order.fulfillment_status === "fulfilled" ? (
            <>
              <p>
                Fulfilled <DateText value={order.fulfilled_at} />
              </p>
              {order.tracking_number && <p>Tracking: {order.tracking_number}</p>}
              {order.tracking_url && (
                <a href={order.tracking_url} target="_blank" rel="noreferrer">
                  Tracking link <ExternalLink size={14} />
                </a>
              )}
              <button
                className="admin-button secondary"
                disabled={saving}
                onClick={() => {
                  if (window.confirm("Mark this order unfulfilled?"))
                    void perform(`${endpoint}/unfulfill`, "POST", {});
                }}
              >
                Unfulfill
              </button>
            </>
          ) : (
            <>
              <Field
                label="Tracking number"
                name="tracking_number"
                value={tracking}
                onChange={setTracking}
                error={errors.tracking_number}
              />
              <Field
                label="Tracking URL"
                name="tracking_url"
                type="url"
                value={url}
                onChange={setUrl}
                error={errors.tracking_url}
              />
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                />
                Notify customer by email
              </label>
              <button
                className="admin-button"
                disabled={saving || order.status !== "paid"}
                onClick={() =>
                  void perform(`${endpoint}/fulfill`, "POST", {
                    tracking_number: tracking || undefined,
                    tracking_url: url || undefined,
                    notify,
                  })
                }
              >
                {saving ? "Saving…" : "Fulfill order"}
              </button>
              {order.status !== "paid" && <p className="admin-help">Only paid orders can be fulfilled.</p>}
            </>
          )}
        </section>
      </div>
      <section className="admin-panel admin-section">
        <h2>Email deliveries</h2>
        <div className="admin-table-wrap admin-delivery-table">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>To</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Sent</th>
                <th>Last error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {order.email_deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.kind.replaceAll("_", " ")}</td>
                  <td>{delivery.to}</td>
                  <td>
                    <Chip value={delivery.status} />
                  </td>
                  <td>{delivery.attempts}</td>
                  <td>
                    <DateText value={delivery.sent_at} />
                  </td>
                  <td>{delivery.last_error ?? "—"}</td>
                  <td>
                    <button
                      className="admin-text-button"
                      disabled={saving}
                      onClick={() => void resend(delivery)}
                    >
                      Resend
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-delivery-cards">
          {order.email_deliveries.map((delivery) => (
            <div className="admin-card" key={delivery.id}>
              <div>
                <strong>{delivery.kind.replaceAll("_", " ")}</strong>
                <Chip value={delivery.status} />
              </div>
              <p>{delivery.to}</p>
              <small>
                {delivery.attempts} attempts · <DateText value={delivery.sent_at} />
              </small>
              {delivery.last_error && <p>{delivery.last_error}</p>}
              <button className="admin-text-button" disabled={saving} onClick={() => void resend(delivery)}>
                Resend
              </button>
            </div>
          ))}
        </div>
        {!order.email_deliveries.length && <p>No email deliveries recorded.</p>}
      </section>
    </>
  );
}
export function ProductsPage() {
  const resource = useResource<{ products: AdminProduct[] }>("/products");
  return (
    <>
      <Heading eyebrow="CATALOG" title="Products" />
      <Result resource={resource}>
        {(data) => (
          <>
            <p className="admin-count">{data.products.length} products</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Drop</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.slug}>
                      <td>
                        <Link to={`/admin/products/${product.slug}`}>{product.name}</Link>
                      </td>
                      <td>
                        <Chip value={product.status} />
                      </td>
                      <td>
                        <Money cents={product.price_cents} />
                      </td>
                      <td>{product.stock_quantity}</td>
                      <td>{product.drop?.name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-cards">
              {data.products.map((product) => (
                <Link className="admin-card" key={product.slug} to={`/admin/products/${product.slug}`}>
                  <strong>{product.name}</strong>
                  <div>
                    <Chip value={product.status} />
                    <Money cents={product.price_cents} />
                  </div>
                  <p>{product.stock_quantity} in stock</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </Result>
    </>
  );
}
export function ProductPage() {
  const location = useLocation(),
    slug = location.pathname.split("/")[3];
  const resource = useResource<{ product: AdminProduct }>(`/products/${encodeURIComponent(slug ?? "")}`);
  return (
    <>
      <Link className="admin-back" to={backPath(location.search, "products")}>
        ← Products
      </Link>
      <Result resource={resource}>
        {(data) => <ProductEditor key={data.product.slug} product={data.product} reload={resource.reload} />}
      </Result>
    </>
  );
}
function ProductEditor({ product, reload }: { product: AdminProduct; reload: () => void }) {
  const api = useAdminApi();
  const [form, setForm] = useState<ProductForm>(() => productForm(product));
  const [delta, setDelta] = useState(""),
    [reason, setReason] = useState("");
  const [movements, setMovements] = useState<
    { id: number | string; delta: number; reason: string; created_at: string }[]
  >([]);
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [formFailure, setFormFailure] = useState(""),
    [stockFailure, setStockFailure] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<ProductForm>(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsaved((dirty || !!delta.trim() || !!reason.trim()) && !saving);
  useEffect(() => {
    api<{ inventory_movements: typeof movements }>(`/products/${product.slug}/inventory_movements`)
      .then((result) => setMovements(result.inventory_movements))
      .catch(() => {});
  }, [api, product.slug]);
  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save() {
    const invalid = validateProduct(form);
    const invalidNumber = form.specs.find(
      (row) => row.originalType === "number" && (row.value.trim() === "" || !Number.isFinite(Number(row.value)))
    );
    if (invalidNumber) invalid.specs = `Enter a numeric value for ${invalidNumber.key || "this specification"}.`;
    const invalidJson = form.specs.find((row) => row.originalType === "json" && !parseJsonSpec(row.value).ok);
    if (invalidJson) invalid.specs = `Enter valid JSON for ${invalidJson.key || "this specification"}.`;
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      return;
    }
    setSaving(true);
    setFormFailure("");
    setErrors({});
    try {
      await api(`/products/${product.slug}`, {
        method: "PATCH",
        body: productPatch(form, initial),
      });
      setInitial(form);
      setMessage("Product saved.");
      reload();
    } catch (cause) {
      const mapped = formError(cause);
      setFormFailure(mapped.message);
      setErrors(mapped.fields);
    } finally {
      setSaving(false);
    }
  }
  async function adjust() {
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0) {
      setErrors({ delta: "Enter a nonzero whole number." });
      return;
    }
    if (!reason.trim()) {
      setErrors({ reason: "Give a reason for this adjustment." });
      return;
    }
    setSaving(true);
    setStockFailure("");
    setErrors({});
    try {
      await api(`/products/${product.slug}/stock_adjustments`, {
        method: "POST",
        body: { delta: amount, reason: reason.trim() },
      });
      setDelta("");
      setReason("");
      setMessage("Stock adjusted.");
      reload();
      const result = await api<{ inventory_movements: typeof movements }>(
        `/products/${product.slug}/inventory_movements`
      );
      setMovements(result.inventory_movements);
    } catch (cause) {
      const mapped = formError(cause);
      setStockFailure(mapped.message);
      setErrors(mapped.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Heading eyebrow="PRODUCT EDITOR" title={product.name} action={<Chip value={product.status} />} />
      <Notice text={message} />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Product details</h2>
          <div className="admin-form-grid">
            <Field
              label="Name"
              name="name"
              value={form.name}
              onChange={(value) => update("name", value)}
              error={errors.name}
              required
            />
            <Field
              label="Price (USD)"
              name="price"
              type="text"
              value={form.price}
              onChange={(value) => update("price", value)}
              error={errors.price || errors.price_cents}
              required
            />
          </div>
          <TextArea
            label="Summary"
            name="summary"
            value={form.summary}
            onChange={(value) => update("summary", value)}
            error={errors.summary}
            required
          />
          <TextArea
            label="Description"
            name="description"
            value={form.description}
            onChange={(value) => update("description", value)}
            error={errors.description}
            required
          />
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => update("status", event.target.value)}>
                {["draft", "active", "archived"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              {errors.status && <small>{errors.status}</small>}
            </label>
            <Field
              label="Position"
              name="position"
              type="number"
              value={form.position}
              onChange={(value) => update("position", Number(value))}
              error={errors.position}
            />
          </div>
          <h3>Specifications</h3>
          {form.specs.map((row, index) => (
            <div className="admin-spec-row" key={index}>
              <input
                aria-label={`Spec key ${index + 1}`}
                placeholder="Key"
                value={row.key}
                onChange={(event) =>
                  update(
                    "specs",
                    form.specs.map((item, i) => (i === index ? { ...item, key: event.target.value } : item))
                  )
                }
              />
              <input
                aria-label={`Spec value ${index + 1}`}
                placeholder="Value"
                type={row.originalType === "number" ? "number" : "text"}
                value={row.value}
                hidden={row.originalType === "boolean"}
                onChange={(event) =>
                  update(
                    "specs",
                    form.specs.map((item, i) => (i === index ? { ...item, value: event.target.value } : item))
                  )
                }
              />
              {row.originalType === "boolean" && (
                <select
                  aria-label={`Spec value ${index + 1}`}
                  value={row.value}
                  onChange={(event) =>
                    update(
                      "specs",
                      form.specs.map((item, i) => (i === index ? { ...item, value: event.target.value } : item))
                    )
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
              <button
                type="button"
                aria-label={`Remove spec ${index + 1}`}
                onClick={() =>
                  update(
                    "specs",
                    form.specs.filter((_, i) => i !== index)
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="admin-text-button"
            onClick={() =>
              update("specs", [...form.specs, { key: "", value: "", originalType: "string" }])
            }
          >
            <Plus size={16} /> Add spec
          </button>
          <TextArea
            label="Includes (one per line)"
            name="includes"
            value={form.includes}
            onChange={(value) => update("includes", value)}
            error={errors.includes}
          />
          <Field
            label="Art credit"
            name="art_credit"
            value={form.credit}
            onChange={(value) => update("credit", value)}
            error={errors.art}
          />
          <TextArea
            label="Art story"
            name="art_story"
            value={form.story}
            onChange={(value) => update("story", value)}
          />
          <TextArea
            label="Placeholders (one per line)"
            name="placeholders"
            value={form.placeholders}
            onChange={(value) => update("placeholders", value)}
          />
          {errors.specs && <p className="admin-field-error">{errors.specs}</p>}
          <Notice text={formFailure} kind="error" />
          <button className="admin-button" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Saving…" : "Save product"}
          </button>
        </section>
        <section className="admin-panel">
          <h2>Images</h2>
          <p className="admin-help">Images are read only in this phase.</p>
          <div className="admin-images">
            {(product.images ?? []).map((image, index) => (
              <img
                key={index}
                src={`${image.base}-${image.widths?.[0] ?? 640}.webp`}
                alt={image.alt ?? product.name}
              />
            ))}
          </div>
          <h2 className="admin-subheading">Stock</h2>
          <p className="admin-stock">{product.stock_quantity} units</p>
          <div className="admin-form-grid">
            <Field
              label="Adjustment (+ / −)"
              name="delta"
              type="number"
              value={delta}
              onChange={setDelta}
              error={errors.delta}
            />
            <Field label="Reason" name="reason" value={reason} onChange={setReason} error={errors.reason} />
          </div>
          <Notice text={stockFailure} kind="error" />
          <button className="admin-button secondary" disabled={saving} onClick={() => void adjust()}>
            {saving ? "Saving…" : "Adjust stock"}
          </button>
          <h2 className="admin-subheading">Movement history</h2>
          {movements.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Change</th>
                    <th>Reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.delta > 0 ? "+" : ""}
                        {item.delta}
                      </td>
                      <td>{item.reason}</td>
                      <td>
                        <DateText value={item.created_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No adjustments yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
export function DropsPage() {
  const resource = useResource<{ drops: AdminDrop[] }>("/drops");
  return (
    <>
      <Heading eyebrow="RELEASES" title="Drops" />
      <Result resource={resource}>
        {(data) => (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Drop</th>
                    <th>State</th>
                    <th>Release (ChST)</th>
                    <th>Quantity</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drops.map((drop) => (
                    <tr key={drop.slug}>
                      <td>
                        <Link to={`/admin/drops/${drop.slug}`}>{drop.name}</Link>
                      </td>
                      <td>
                        <Chip value={drop.state} />
                      </td>
                      <td>
                        {drop.release_at ? <DateText value={drop.release_at} /> : "Coming soon"}
                      </td>
                      <td>{drop.quantity}</td>
                      <td>{drop.product?.stock_quantity ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-cards">
              {data.drops.map((drop) => (
                <Link className="admin-card" key={drop.slug} to={`/admin/drops/${drop.slug}`}>
                  <strong>{drop.name}</strong>
                  <Chip value={drop.state} />
                  <p>
                    {drop.release_at ? <><DateText value={drop.release_at} /> ChST</> : "Coming soon"}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </Result>
    </>
  );
}
export function DropPage() {
  const location = useLocation(),
    slug = location.pathname.split("/")[3];
  const resource = useResource<{ drop: AdminDrop }>(`/drops/${encodeURIComponent(slug ?? "")}`);
  return (
    <>
      <Link className="admin-back" to="/admin/drops">
        ← Drops
      </Link>
      <Result resource={resource}>
        {(data) => <DropEditor key={data.drop.slug} drop={data.drop} reload={resource.reload} />}
      </Result>
    </>
  );
}
function DropEditor({ drop, reload }: { drop: AdminDrop; reload: () => void }) {
  const api = useAdminApi();
  const [form, setForm] = useState<DropForm>(() => dropForm(drop));
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<DropForm>(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsaved(dirty && !saving);
  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  const release = form.release ? guamToIso(form.release) : null,
    closes = form.closes ? guamToIso(form.closes) : null;
  const [currentTime] = useState(() => Date.now());
  const state = !form.release
    ? "Coming soon"
    : !release
      ? "Invalid release"
      : currentTime < Date.parse(release)
        ? "Upcoming"
        : closes && currentTime >= Date.parse(closes)
          ? "Closed"
          : (drop.product?.stock_quantity ?? 1) < 1
            ? "Sold out"
            : "Live";
  async function save() {
    const invalid = validateDrop(form);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      return;
    }
    setSaving(true);
    setFailure("");
    setErrors({});
    try {
      await api(`/drops/${drop.slug}`, {
        method: "PATCH",
        body: dropPatch(form, initial),
      });
      setInitial(form);
      setMessage("Drop saved.");
      reload();
    } catch (cause) {
      const mapped = formError(cause);
      setFailure(mapped.message);
      setErrors(mapped.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Heading eyebrow="DROP EDITOR" title={drop.name} action={<Chip value={drop.state} />} />
      <Notice text={message} />
      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Release details</h2>
          <Field
            label="Name"
            name="name"
            value={form.name}
            onChange={(value) => update("name", value)}
            error={errors.name}
            required
          />
          <div className="admin-form-grid">
            <Field
              label="Release · Guam time (ChST, UTC+10). Leave empty for Coming soon"
              name="release_at"
              type="datetime-local"
              value={form.release}
              onChange={(value) => update("release", value)}
              error={errors.release_at}
            />
            <Field
              label="Close · Guam time (ChST, UTC+10)"
              name="closes_at"
              type="datetime-local"
              value={form.closes}
              onChange={(value) => update("closes", value)}
              error={errors.closes_at}
            />
          </div>
          <div className="admin-form-grid">
            <Field
              label="Per customer limit"
              name="per_customer_limit"
              type="number"
              min={1}
              value={form.limit}
              onChange={(value) => update("limit", Number(value))}
              error={errors.per_customer_limit}
              required
            />
            <Field
              label="Announced quantity"
              name="quantity"
              type="number"
              min={0}
              value={form.quantity}
              onChange={(value) => update("quantity", Number(value))}
              error={errors.quantity}
              required
            />
          </div>
          <p className="admin-help">
            Quantity is the announced edition size. Adjust product stock separately.
          </p>
          <Notice text={failure} kind="error" />
          <button className="admin-button" disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? "Saving…" : "Save drop"}
          </button>
        </section>
        <section className="admin-panel">
          <h2>Live preview</h2>
          <dl className="admin-meta">
            <dt>Computed state</dt>
            <dd>
              <Chip value={state.toLowerCase().replace(" ", "_")} />
            </dd>
            <dt>Release · ChST</dt>
            <dd>{release ? datePreview(release, "Pacific/Guam") : "—"}</dd>
            <dt>Release · PT</dt>
            <dd>{release ? datePreview(release, "America/Los_Angeles") : "—"}</dd>
            <dt>Release · HT</dt>
            <dd>{release ? datePreview(release, "Pacific/Honolulu") : "—"}</dd>
            <dt>Close · ChST</dt>
            <dd>{closes ? datePreview(closes, "Pacific/Guam") : "No close"}</dd>
            <dt>Product stock</dt>
            <dd>{drop.product?.stock_quantity ?? "—"}</dd>
          </dl>
          {drop.product && (
            <Link to={`/admin/products/${drop.product.slug}`}>Edit {drop.product.name} stock →</Link>
          )}
        </section>
      </div>
    </>
  );
}
export function SubscribersPage() {
  const api = useAdminApi();
  const location = useLocation(),
    navigate = useNavigate();
  const page = Number(new URLSearchParams(location.search).get("page") || 1);
  const resource = useResource<
    Page<"subscribers", { email: string; source: string; drop_slug?: string | null; created_at: string }>
  >(`/subscribers?page=${page}`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await api<Blob>("/subscribers.csv", { csv: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "subscribers.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(issue(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="AUDIENCE"
        title="Subscribers"
        action={
          <button className="admin-button" disabled={busy} onClick={() => void download()}>
            <Download size={17} />
            {busy ? "Downloading…" : "Download CSV"}
          </button>
        }
      />
      <Notice text={error} kind="error" />
      <Result resource={resource}>
        {(data) => (
          <>
            <p className="admin-count">{data.total} subscribers</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Source</th>
                    <th>Drop</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscribers.map((subscriber, index) => (
                    <tr key={`${subscriber.email}-${index}`}>
                      <td>{subscriber.email}</td>
                      <td>{subscriber.source}</td>
                      <td>{subscriber.drop_slug ?? "—"}</td>
                      <td>
                        <DateText value={subscriber.created_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-cards">
              {data.subscribers.map((subscriber, index) => (
                <div className="admin-card" key={`${subscriber.email}-${index}`}>
                  <strong>{subscriber.email}</strong>
                  <p>
                    {subscriber.source} · {subscriber.drop_slug ?? "No drop"}
                  </p>
                  <small>
                    <DateText value={subscriber.created_at} />
                  </small>
                </div>
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} onPage={(next) => navigate(`?page=${next}`)} />
          </>
        )}
      </Result>
    </>
  );
}
export function AdminsPage({ currentUser }: { currentUser: AdminUser }) {
  const api = useAdminApi();
  const resource = useResource<{
    users: AdminUser[];
    invitations: { id: number | string; email: string; created_at?: string }[];
  }>("/users");
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState(""),
    [inviteFailure, setInviteFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useUnsaved(!!email.trim() && !busy);
  const invite = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrors({ email: "Enter a valid email address." });
      return;
    }
    setBusy(true);
    setInviteFailure("");
    setErrors({});
    try {
      await api("/invitations", { method: "POST", body: { email: email.trim() } });
      setEmail("");
      setMessage("Invitation sent.");
      resource.reload();
    } catch (cause) {
      const mapped = formError(cause);
      setInviteFailure(mapped.message);
      setErrors(mapped.fields);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: number | string, address: string) => {
    if (!window.confirm(`Revoke the invitation for ${address}?`)) return;
    setBusy(true);
    setFailure("");
    try {
      await api(`/invitations/${id}`, { method: "DELETE" });
      setMessage("Invitation revoked.");
      resource.reload();
    } catch (cause) {
      setFailure(issue(cause));
    } finally {
      setBusy(false);
    }
  };
  const deactivate = async (user: AdminUser) => {
    if (!window.confirm(`Deactivate ${user.email}? They will lose admin access.`)) return;
    setBusy(true);
    setFailure("");
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: { active: false } });
      setMessage("Admin deactivated.");
      resource.reload();
    } catch (cause) {
      setFailure(issue(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading eyebrow="ACCESS" title="Admins" />
      <Notice text={message} />
      <Notice text={failure} kind="error" />
      <section className="admin-panel">
        <h2>Invite an admin</h2>
        <div className="admin-inline-form">
          <Field
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            error={errors.email}
            required
          />
          <button className="admin-button" disabled={busy} onClick={() => void invite()}>
            {busy ? "Sending…" : "Send invite"}
          </button>
        </div>
        <Notice text={inviteFailure} kind="error" />
        <p className="admin-help">Invitations are sent through Clerk. Only invited accounts can sign up.</p>
      </section>
      <Result resource={resource}>
        {(data) => (
          <div className="admin-detail-grid admin-section">
            <section className="admin-panel">
              <h2>Active admins</h2>
              {data.users.map((user) => (
                <div className="admin-person" key={user.id}>
                  <div>
                    <strong>{user.name || user.email}</strong>
                    <small>{user.email}</small>
                  </div>
                  <button
                    className="admin-text-button"
                    disabled={busy || String(user.id) === String(currentUser.id)}
                    onClick={() => void deactivate(user)}
                  >
                    Deactivate
                  </button>
                </div>
              ))}
            </section>
            <section className="admin-panel">
              <h2>Pending invitations</h2>
              {data.invitations.length ? (
                data.invitations.map((invitation) => (
                  <div className="admin-person" key={invitation.id}>
                    <div>
                      <strong>{invitation.email}</strong>
                      {invitation.created_at && (
                        <small>
                          Invited <DateText value={invitation.created_at} />
                        </small>
                      )}
                    </div>
                    <button
                      className="admin-text-button"
                      disabled={busy}
                      onClick={() => void revoke(invitation.id, invitation.email)}
                    >
                      Revoke
                    </button>
                  </div>
                ))
              ) : (
                <p>No pending invitations.</p>
              )}
            </section>
          </div>
        )}
      </Result>
    </>
  );
}
