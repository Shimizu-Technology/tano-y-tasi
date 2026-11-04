import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { formError, useAdminApi, type AdminDrop, type AdminProduct } from "./adminApi";
import { dollarsToCents, guamToIso, placeholderFields, togglePlaceholder, validateDrop, validateProduct } from "./adminUtils";
import { Field, Heading, Notice, Result, TextArea, issue, useResource, useUnsaved } from "./AdminPages";

const CORE = "core";
const dropLabel = (drop: AdminDrop) => `Drop ${String(drop.number).padStart(3, "0")}: ${drop.name}`;

function CollectionSelect({
  drops,
  value,
  onChange,
  current,
  error,
  label,
}: {
  drops: AdminDrop[];
  value: string;
  onChange: (value: string) => void;
  current?: string;
  error?: string;
  label: string;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select
        name="collection"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "collection-error" : undefined}
      >
        <option value={CORE}>Always available (core collection)</option>
        {drops.map((drop) => {
          const taken = !!drop.product && drop.product.slug !== current;
          return (
            <option key={drop.slug} value={drop.slug} disabled={taken}>
              {dropLabel(drop)}{taken ? ` (has ${drop.product!.name})` : ""}
            </option>
          );
        })}
      </select>
      {error && <small id="collection-error">{error}</small>}
    </label>
  );
}

export function NewProductPage() {
  const drops = useResource<{ drops: AdminDrop[] }>("/drops");
  return (
    <>
      <Link className="admin-back" to="/admin/products">← Products</Link>
      <Heading eyebrow="CATALOG" title="New product" />
      <Result resource={drops}>{(data) => <NewProductForm drops={data.drops} />}</Result>
    </>
  );
}

function NewProductForm({ drops }: { drops: AdminDrop[] }) {
  const api = useAdminApi();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", price: "", summary: "", description: "", collection: CORE });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !!(form.name || form.price || form.summary || form.description || form.collection !== CORE);
  useUnsaved(dirty && !saving && !created);
  useEffect(() => {
    if (created) void navigate(`/admin/products/${created}`, { replace: true });
  }, [created, navigate]);
  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    const invalid = validateProduct(form);
    setErrors(invalid);
    setFailure("");
    if (Object.keys(invalid).length) return;
    setSaving(true);
    try {
      const placement = form.collection === CORE ? { kind: "core" } : { kind: "drop", drop_slug: form.collection };
      const { product } = await api<{ product: AdminProduct }>("/products", {
        method: "POST",
        body: {
          name: form.name.trim(),
          summary: form.summary.trim(),
          description: form.description.trim(),
          price_cents: dollarsToCents(form.price),
          ...placement,
        },
      });
      setCreated(product.slug);
    } catch (cause) {
      const mapped = formError(cause);
      const shown = new Set(["name", "summary", "description", "price_cents", "drop_slug"]);
      setErrors(mapped.fields);
      setFailure(Object.keys(mapped.fields).every((key) => shown.has(key)) ? mapped.message : issue(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="admin-panel admin-narrow">
      <p className="admin-help">It starts as a draft with no stock, so customers won't see it. Add images, stock and details on the next screen.</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Name" name="name" value={form.name} onChange={update("name")} error={errors.name} required />
        <Field label="Price (USD)" name="price" value={form.price} onChange={update("price")} error={errors.price || errors.price_cents} required />
        <TextArea label="Summary" name="summary" value={form.summary} onChange={update("summary")} error={errors.summary} required />
        <TextArea label="Description" name="description" value={form.description} onChange={update("description")} error={errors.description} required />
        <CollectionSelect label="Where it's sold" drops={drops} value={form.collection} onChange={update("collection")} error={errors.drop_slug || errors.kind} />
        <p className="admin-help">A drop can hold one product. <Link to="/admin/drops/new">Create a new drop</Link> if you need another.</p>
        <Notice text={failure} kind="error" />
        <button className="admin-button" disabled={saving}>{saving ? "Creating…" : "Create product"}</button>
      </form>
    </section>
  );
}

export function NewDropPage() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const blank = { name: "", release: "", closes: "", limit: 2, quantity: 0 };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useUnsaved(JSON.stringify(form) !== JSON.stringify(blank) && !saving && !created);
  useEffect(() => {
    if (created) void navigate(`/admin/drops/${created}`, { replace: true });
  }, [created, navigate]);
  async function save() {
    const invalid = validateDrop(form);
    setErrors(invalid);
    setFailure("");
    if (Object.keys(invalid).length) return;
    setSaving(true);
    try {
      const { drop } = await api<{ drop: AdminDrop }>("/drops", {
        method: "POST",
        body: {
          name: form.name.trim(),
          release_at: form.release ? guamToIso(form.release) : null,
          closes_at: form.closes ? guamToIso(form.closes) : null,
          per_customer_limit: form.limit,
          quantity: form.quantity,
        },
      });
      setCreated(drop.slug);
    } catch (cause) {
      const mapped = formError(cause);
      const shown = new Set(["name", "release_at", "closes_at", "per_customer_limit", "quantity"]);
      setErrors(mapped.fields);
      setFailure(Object.keys(mapped.fields).every((key) => shown.has(key)) ? mapped.message : issue(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Link className="admin-back" to="/admin/drops">← Drops</Link>
      <Heading eyebrow="RELEASES" title="New drop" />
      <section className="admin-panel admin-narrow">
        <p className="admin-help">It gets the next drop number. It stays off the site until you put a product in it from that product's page.</p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Name" name="name" value={form.name} onChange={(name) => setForm({ ...form, name })} error={errors.name} required />
          <Field
            label="Release · Guam time (ChST, UTC+10). Leave empty for Coming soon"
            name="release_at"
            type="datetime-local"
            value={form.release}
            onChange={(release) => setForm({ ...form, release })}
            error={errors.release_at}
          />
          <Field
            label="Close · Guam time (ChST, UTC+10). Optional"
            name="closes_at"
            type="datetime-local"
            value={form.closes}
            onChange={(closes) => setForm({ ...form, closes })}
            error={errors.closes_at}
          />
          <div className="admin-form-grid">
            <Field label="Per customer limit" name="per_customer_limit" type="number" min={1} value={form.limit} onChange={(limit) => setForm({ ...form, limit: Number(limit) })} error={errors.per_customer_limit} required />
            <Field label="Announced quantity" name="quantity" type="number" min={0} value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} error={errors.quantity} />
          </div>
          <p className="admin-help">Not decided? Leave quantity at 0 and customers won't see a number. It doesn't change stock.</p>
          <Notice text={failure} kind="error" />
          <button className="admin-button" disabled={saving}>{saving ? "Creating…" : "Create drop"}</button>
        </form>
      </section>
    </>
  );
}

export function PlaceholderChecklist({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return (
    <fieldset className="admin-checklist">
      <legend>Not confirmed yet: hide from customers where we can</legend>
      <div>
        {placeholderFields.map((field) => (
          <label key={field.key}>
            <input
              type="checkbox"
              checked={value.includes(field.key)}
              onChange={(event) => onChange(togglePlaceholder(value, field.key, event.target.checked))}
            />
            {field.label}
          </label>
        ))}
      </div>
      <p className="admin-help">
        Price, Stock and Release date are reminders for you: customers still see them when they apply. To hide a release date, leave it empty on the drop.
      </p>
    </fieldset>
  );
}

export function ProductPlacement({ product, reload }: { product: AdminProduct; reload: () => void }) {
  const api = useAdminApi();
  const drops = useResource<{ drops: AdminDrop[] }>("/drops");
  const current = product.drop?.slug ?? CORE;
  const [choice, setChoice] = useState(current);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  async function move(list: AdminDrop[]) {
    const target = list.find((drop) => drop.slug === choice);
    const leaving = product.drop ? ` ${product.drop.name} will have no product and stops showing on the site until you put another one in it.` : "";
    const question = target
      ? `Move ${product.name} to ${dropLabel(target)}? Customers can only buy it while that drop is live, within its limit.${leaving}`
      : `Move ${product.name} to the always-available collection? Customers can buy it any time it's active and in stock, with no release date or limit.${leaving}`;
    if (!window.confirm(question)) return;
    setSaving(true);
    setMessage("");
    setFailure("");
    try {
      await api(`/products/${product.slug}`, { method: "PATCH", body: target ? { kind: "drop", drop_slug: target.slug } : { kind: "core", drop_slug: null } });
      setMessage("Moved.");
      reload();
      drops.reload();
    } catch (cause) {
      setFailure(issue(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <h2 className="admin-subheading">Where it's sold</h2>
      <p className="admin-help">
        The always-available collection is for products you restock. A drop is a one-time release with a release date and a per-customer limit. A drop holds one product. Stock and past orders stay as they are when you move it.
      </p>
      <Result resource={drops}>
        {(data) => (
          <>
            <CollectionSelect label="Sold in" drops={data.drops} value={choice} onChange={setChoice} current={product.slug} />
            <Notice text={message} />
            <Notice text={failure} kind="error" />
            <button type="button" className="admin-button secondary" disabled={saving || choice === current} onClick={() => void move(data.drops)}>
              {saving ? "Moving…" : "Move product"}
            </button>
          </>
        )}
      </Result>
    </>
  );
}
