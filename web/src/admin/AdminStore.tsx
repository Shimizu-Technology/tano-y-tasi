import { useState } from "react";
import { Link, useLocation } from "react-router";
import { fieldErrors, useAdminApi, type AdminPage, type StoreSettings } from "./adminApi";
import { Field, Heading, Notice, Result, TextArea, issue, useResource, useUnsaved } from "./AdminPages";

const paymentNotes: Record<StoreSettings["payment_mode"], string> = {
  stripe_live: "Stripe is live: open means customers can really pay.",
  stripe_test: "Stripe is in test mode: no real money can move, even with the store open.",
  simulated: "Payments are simulated on this environment.",
};

export function StorePage() {
  const resource = useResource<{ store: StoreSettings }>("/store");
  const pages = useResource<{ pages: AdminPage[] }>("/pages");
  return (
    <>
      <Heading eyebrow="SETTINGS" title="Store" />
      <Result resource={resource}>
        {(data) => <StoreEditor store={data.store} reload={resource.reload} />}
      </Result>
      <section className="admin-panel admin-section">
        <h2>Policy pages</h2>
        <p className="admin-help">These show on the site as soon as you save. Use {"{{contact_email}}"} wherever the contact email belongs.</p>
        <Result resource={pages}>
          {(data) => (
            <ul className="admin-page-list">
              {data.pages.map((page) => (
                <li key={page.slug}><Link to={`/admin/store/pages/${page.slug}`}>{page.title}</Link></li>
              ))}
            </ul>
          )}
        </Result>
      </section>
    </>
  );
}

function StoreEditor({ store, reload }: { store: StoreSettings; reload: () => void }) {
  const api = useAdminApi();
  const initial = {
    contact_email: store.contact_email,
    tagline: store.tagline,
    secondary_tagline: store.secondary_tagline,
    story: store.story,
    mission: store.mission_lines.join("\n"),
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsaved(dirty && !saving);
  const update = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save(body: unknown, done: string) {
    setSaving(true);
    setMessage("");
    setFailure("");
    try {
      await api("/store", { method: "PATCH", body });
      setMessage(done);
      setErrors({});
      reload();
    } catch (cause) {
      setFailure(issue(cause));
      setErrors(fieldErrors(cause));
    } finally {
      setSaving(false);
    }
  }
  function toggleSales() {
    const opening = !store.sales_open;
    const question = opening
      ? `Open the store? Customers can start buying right away. ${paymentNotes[store.payment_mode]}`
      : "Close the store? Nobody can start a new checkout until you open it again.";
    if (window.confirm(question)) void save({ sales_open: opening }, opening ? "The store is open." : "The store is closed.");
  }
  return (
    <>
      <Notice text={message} />
      <Notice text={failure} kind="error" />
      <section className="admin-panel admin-section">
        <h2>Sales</h2>
        <p><strong>{store.sales_open ? "The store is open." : "The store is closed."}</strong> {store.sales_open ? "Customers can buy." : "Products show as Coming soon, and customers can join the list."}</p>
        <p className="admin-help">{paymentNotes[store.payment_mode]}</p>
        <button className={`admin-button ${store.sales_open ? "secondary" : ""}`} disabled={saving} onClick={toggleSales}>
          {store.sales_open ? "Close the store" : "Open the store"}
        </button>
      </section>
      <section className="admin-panel admin-section">
        <h2>Contact and brand copy</h2>
        <Field label="Contact email" name="contact_email" type="email" value={form.contact_email} onChange={update("contact_email")} error={errors.contact_email} required />
        <p className="admin-help">Shown on the Contact and policy pages, and customers' replies to order emails go here.</p>
        <Field label="Tagline" name="tagline" value={form.tagline} onChange={update("tagline")} error={errors.tagline} required />
        <Field label="Secondary tagline" name="secondary_tagline" value={form.secondary_tagline} onChange={update("secondary_tagline")} error={errors.secondary_tagline} />
        <TextArea label="Mission lines, one per line" name="mission_lines" value={form.mission} onChange={update("mission")} error={errors.mission_lines} />
        <TextArea label="Story" name="story" value={form.story} onChange={update("story")} error={errors.story} />
        <button
          className="admin-button"
          disabled={saving || !dirty}
          onClick={() => void save({
            contact_email: form.contact_email.trim(),
            tagline: form.tagline.trim(),
            secondary_tagline: form.secondary_tagline.trim(),
            story: form.story.trim(),
            mission_lines: form.mission.split("\n").map((line) => line.trim()).filter(Boolean),
          }, "Store saved.")}
        >
          {saving ? "Saving…" : "Save store"}
        </button>
      </section>
    </>
  );
}

export function StorePageEditor() {
  const slug = useLocation().pathname.split("/")[4];
  const resource = useResource<{ page: AdminPage }>(`/pages/${encodeURIComponent(slug)}`);
  return (
    <>
      <Link className="admin-back" to="/admin/store">← Store</Link>
      <Result resource={resource}>{(data) => <PageEditor key={data.page.slug} page={data.page} reload={resource.reload} />}</Result>
    </>
  );
}

function PageEditor({ page, reload }: { page: AdminPage; reload: () => void }) {
  const api = useAdminApi();
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = title !== page.title || body !== page.body;
  useUnsaved(dirty && !saving);
  async function save() {
    setSaving(true);
    setMessage("");
    setFailure("");
    try {
      await api(`/pages/${encodeURIComponent(page.slug)}`, { method: "PATCH", body: { title: title.trim(), body } });
      setMessage("Page saved. It's live on the site.");
      setErrors({});
      reload();
    } catch (cause) {
      setFailure(issue(cause));
      setErrors(fieldErrors(cause));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Heading eyebrow="POLICY PAGE" title={page.title} action={<a className="admin-button secondary" href={`/info/${page.slug}`} target="_blank" rel="noreferrer">View on site</a>} />
      <Notice text={message} />
      <Notice text={failure} kind="error" />
      <section className="admin-panel admin-section">
        <Field label="Title" name="title" value={title} onChange={setTitle} error={errors.title} required />
        <TextArea label="Text" name="body" value={body} onChange={setBody} error={errors.body} rows={24} />
        <p className="admin-help">Start a line with ## for a heading and - for a list. Use **bold** and [link text](/info/returns).</p>
        <button className="admin-button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save page"}</button>
      </section>
    </>
  );
}
