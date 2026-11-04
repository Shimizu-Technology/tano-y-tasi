import { useEffect, useState } from "react";
import { useAdminApi, formError, type AdminProduct, type ProductionRun } from "./adminApi";
import { centsToDollars, dateOnly, dollarsToCents, margin, validateRun } from "./adminUtils";
import { Chip, DateText, Field, Money, Notice, Result, TextArea, issue, useResource } from "./AdminPages";

const BLANK = { quantity: "", supplier: "", unitCost: "", expected: "", notes: "" };
type RunForm = typeof BLANK;

const formFor = (run: ProductionRun): RunForm => ({
  quantity: String(run.quantity),
  supplier: run.supplier ?? "",
  unitCost: run.unit_cost_cents == null ? "" : centsToDollars(run.unit_cost_cents),
  expected: run.expected_at ?? "",
  notes: run.notes ?? "",
});

const bodyFor = (form: RunForm) => ({
  quantity: Number(form.quantity),
  supplier: form.supplier.trim() || null,
  unit_cost_cents: form.unitCost.trim() ? dollarsToCents(form.unitCost) : null,
  expected_at: form.expected || null,
  notes: form.notes.trim() || null,
});

function RunFields({ form, setForm, errors, frozenQuantity }: { form: RunForm; setForm: (form: RunForm) => void; errors: Record<string, string>; frozenQuantity?: boolean }) {
  const update = (key: keyof RunForm) => (value: string) => setForm({ ...form, [key]: value });
  return (
    <>
      <div className="admin-form-grid">
        {frozenQuantity ? (
          <p className="admin-help">Quantity can't change once a run is received.</p>
        ) : (
          <Field label="Units ordered" name="quantity" type="number" min={1} value={form.quantity} onChange={update("quantity")} error={errors.quantity} required />
        )}
        <Field label="Cost per unit (USD)" name="unit_cost" value={form.unitCost} onChange={update("unitCost")} error={errors.unit_cost_cents} />
        <Field label="Supplier" name="supplier" value={form.supplier} onChange={update("supplier")} error={errors.supplier} />
        <Field label="Expected date" name="expected_at" type="date" value={form.expected} onChange={update("expected")} error={errors.expected_at} />
      </div>
      <TextArea label="Notes" name="run_notes" value={form.notes} onChange={update("notes")} error={errors.notes} />
    </>
  );
}

function RunCard({ run, product, busy, act, edit }: {
  run: ProductionRun;
  product: AdminProduct;
  busy: boolean;
  act: (path: string, method: "POST" | "PATCH", body: unknown, done: string) => Promise<boolean>;
  edit: () => void;
}) {
  const [receiving, setReceiving] = useState(false);
  const [count, setCount] = useState(String(run.quantity));
  const [error, setError] = useState("");
  const percent = margin(product.price_cents, run.unit_cost_cents);
  const base = `/products/${product.slug}/production_runs/${run.id}`;
  async function receive() {
    if (!/^\d+$/.test(count.trim()) || Number(count) > run.quantity) {
      setError(`Enter a whole number from 0 to ${run.quantity}.`);
      return;
    }
    setError("");
    const added = Number(count);
    if (await act(`${base}/receive`, "POST", { stock_added: added }, added ? `Received. ${added} units added to stock.` : "Received. Stock is unchanged.")) setReceiving(false);
  }
  return (
    <li className="admin-run">
      <div className="admin-run-head">
        <strong>{run.quantity} units</strong>
        <Chip value={run.status} />
      </div>
      <dl className="admin-meta">
        <dt>Expected</dt>
        <dd>{dateOnly(run.expected_at)}</dd>
        {run.supplier && (<><dt>Supplier</dt><dd>{run.supplier}</dd></>)}
        {run.unit_cost_cents != null && (
          <>
            <dt>Cost per unit</dt>
            <dd><Money cents={run.unit_cost_cents} />{percent != null && ` · ${percent}% margin at today's price`}</dd>
          </>
        )}
        {run.status === "received" && (
          <>
            <dt>Received</dt>
            <dd><DateText value={run.received_at} /> · {run.stock_added} added to stock</dd>
          </>
        )}
      </dl>
      {run.notes && <p className="admin-run-notes">{run.notes}</p>}
      {receiving ? (
        <form
          className="admin-run-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void receive();
          }}
        >
          <Field label="Units to add to stock" name="stock_added" type="number" min={0} value={count} onChange={setCount} error={error} required />
          <p className="admin-help">Use a lower number if fewer arrived, or 0 if these units were already allotted to preorders.</p>
          <div className="admin-run-actions">
            <button className="admin-button" disabled={busy}>{busy ? "Saving…" : "Confirm received"}</button>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={() => setReceiving(false)}>Not yet</button>
          </div>
        </form>
      ) : (
        <div className="admin-run-actions">
          {run.status === "ordered" && <button type="button" className="admin-button" disabled={busy} onClick={() => { setCount(String(run.quantity)); setError(""); setReceiving(true); }}>Receive</button>}
          {run.status !== "canceled" && <button type="button" className="admin-button secondary" disabled={busy} onClick={edit}>Edit</button>}
          {run.status === "ordered" && (
            <button
              type="button"
              className="admin-button secondary"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Cancel this run of ${run.quantity} units? It stays in the list, and stock doesn't change.`)) void act(`${base}/cancel`, "POST", {}, "Run canceled.");
              }}
            >
              Cancel run
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function ProductionRuns({ product, reload, onDirty }: { product: AdminProduct; reload: () => void; onDirty?: (dirty: boolean) => void }) {
  const api = useAdminApi();
  const runs = useResource<{ production_runs: ProductionRun[] }>(`/products/${product.slug}/production_runs`);
  const [form, setForm] = useState<RunForm>(BLANK);
  const [editing, setEditing] = useState<ProductionRun | "new" | null>(null);
  const [baseline, setBaseline] = useState<RunForm>(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !!editing && JSON.stringify(form) !== JSON.stringify(baseline) && !busy;
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  function open(target: ProductionRun | "new") {
    const start = target === "new" ? BLANK : formFor(target);
    setEditing(target);
    setForm(start);
    setBaseline(start);
    setErrors({});
    setFailure("");
    setMessage("");
  }
  async function act(path: string, method: "POST" | "PATCH", body: unknown, done: string) {
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      await api(path, { method, body });
      setMessage(done);
      runs.reload();
      reload();
      return true;
    } catch (cause) {
      const mapped = formError(cause);
      setErrors(mapped.fields);
      setFailure(mapped.message || issue(cause));
      runs.reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const frozen = editing !== "new" && editing?.status === "received";
    const invalid = validateRun(frozen ? { ...form, quantity: "1" } : form);
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    const body = bodyFor(form);
    const saved = editing === "new"
      ? await act(`/products/${product.slug}/production_runs`, "POST", body, "Run added.")
      : await act(`/products/${product.slug}/production_runs/${editing!.id}`, "PATCH", body, "Run saved.");
    if (saved) setEditing(null);
  }
  return (
    <section className="admin-panel admin-section">
      <div className="admin-section-head">
        <h2>Production runs</h2>
        {!editing && <button type="button" className="admin-button secondary" onClick={() => open("new")}>Add a run</button>}
      </div>
      <p className="admin-help">Orders you've placed with the factory. Nothing here changes stock until you receive a run, and customers never see costs or suppliers.</p>
      <Notice text={message} />
      <Notice text={failure} kind="error" />
      {editing && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h3>{editing === "new" ? "New run" : "Edit run"}</h3>
          <RunFields form={form} setForm={setForm} errors={errors} frozenQuantity={editing !== "new" && editing.status === "received"} />
          <div className="admin-run-actions">
            <button className="admin-button" disabled={busy}>{busy ? "Saving…" : "Save run"}</button>
            <button type="button" className="admin-button secondary" disabled={busy} onClick={() => setEditing(null)}>Close</button>
          </div>
        </form>
      )}
      <Result resource={runs}>
        {(data) =>
          data.production_runs.length ? (
            <ul className="admin-runs admin-section">
              {data.production_runs.map((run) => (
                <RunCard key={run.id} run={run} product={product} busy={busy} act={act} edit={() => open(run)} />
              ))}
            </ul>
          ) : editing ? null : (
            <p>No production runs yet.</p>
          )
        }
      </Result>
    </section>
  );
}
