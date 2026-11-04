import { useState } from "react";
import { Link } from "react-router";
import { AdminApiError, fieldErrors, useAdminApi, type OrderDetail, type ShippingSettings } from "./adminApi";
import { Field, Heading, Money, Notice, Result, TextArea, issue, useResource, useUnsaved, DateText } from "./AdminPages";
import { centsToDollars, dollarsToCents } from "./adminUtils";

const ZONES: [keyof ShippingSettings["flat_rates"], string][] = [
  ["mainland", "Mainland U.S."],
  ["alaska_hawaii", "Alaska and Hawaii"],
  ["guam_cnmi", "Guam and CNMI"],
  ["territories", "Puerto Rico, USVI and American Samoa"],
  ["military", "Military (APO, FPO, DPO)"],
];
const money = (cents: number | null | undefined) => (cents == null ? "" : centsToDollars(cents));
function settingsForm(settings: ShippingSettings) {
  return {
    mode: settings.mode,
    carriers: settings.carriers.join(", "),
    handling: money(settings.handling_fee_cents),
    freeOver: money(settings.free_shipping_threshold_cents),
    rates: Object.fromEntries(ZONES.map(([zone]) => [zone, money(settings.flat_rates[zone])])) as Record<string, string>,
    pickupEnabled: settings.pickup_enabled,
    pickupInstructions: settings.pickup_instructions,
    origin: { ...settings.origin },
    parcel: Object.fromEntries(Object.entries(settings.parcel).map(([key, value]) => [key, String(value)])) as Record<string, string>,
    customs: { ...settings.customs },
    tax: settings.tax_enabled,
  };
}
export function ShippingSettingsPage() {
  const resource = useResource<{ shipping: ShippingSettings }>("/shipping");
  // Lives here because saving reloads the settings, which starts the form again.
  const [message, setMessage] = useState("");
  return (
    <>
      <Link className="admin-back" to="/admin/store">← Store</Link>
      <Heading eyebrow="SETTINGS" title="Shipping and tax" />
      <Notice text={message} />
      <Result resource={resource}>
        {(data) => <ShippingEditor key={JSON.stringify(data.shipping)} settings={data.shipping} reload={resource.reload} setMessage={setMessage} />}
      </Result>
    </>
  );
}
function ShippingEditor({ settings, reload, setMessage }: { settings: ShippingSettings; reload: () => void; setMessage: (message: string) => void }) {
  const api = useAdminApi();
  const initial = settingsForm(settings);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsaved(dirty && !saving);
  const patch = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));
  async function save() {
    const problems: Record<string, string> = {};
    const cents = (value: string, key: string) => {
      const parsed = dollarsToCents(value);
      if (parsed === null) problems[key] = "Enter an amount like 8.00.";
      return parsed;
    };
    const flat_rates = Object.fromEntries(ZONES.map(([zone]) => [zone, cents(form.rates[zone], `flat_rates.${zone}`)]));
    const handling_fee_cents = cents(form.handling || "0", "handling_fee_cents");
    const free_shipping_threshold_cents = form.freeOver.trim() ? cents(form.freeOver, "free_shipping_threshold_cents") : null;
    const parcel = Object.fromEntries(Object.entries(form.parcel).map(([key, value]) => {
      const number = Number(value);
      if (!value.trim() || !Number.isFinite(number) || number <= 0) problems[`parcel.${key}`] = "Enter a number above 0.";
      return [key, number];
    }));
    setMessage("");
    setErrors(problems);
    if (Object.keys(problems).length) {
      setFailure("Check the highlighted settings.");
      return;
    }
    setFailure("");
    setSaving(true);
    try {
      await api("/shipping", {
        method: "PATCH",
        body: {
          mode: form.mode,
          carriers: form.carriers.split(",").map((carrier) => carrier.trim()).filter(Boolean),
          handling_fee_cents,
          free_shipping_threshold_cents,
          flat_rates,
          pickup_enabled: form.pickupEnabled,
          pickup_instructions: form.pickupInstructions.trim(),
          origin: form.origin,
          parcel,
          customs: form.customs,
          tax_enabled: form.tax,
        },
      });
      setMessage("Shipping saved. New checkouts use it right away.");
      reload();
    } catch (cause) {
      setFailure(issue(cause));
      setErrors(fieldErrors(cause));
    } finally {
      setSaving(false);
    }
  }
  const originField = (key: string, label: string) => (
    <Field label={label} name={`origin.${key}`} value={form.origin[key] ?? ""} error={errors[`origin.${key}`]} onChange={(value) => patch({ origin: { ...form.origin, [key]: value } })} />
  );
  const parcelField = (key: string, label: string) => (
    <Field label={label} name={`parcel.${key}`} value={form.parcel[key] ?? ""} error={errors[`parcel.${key}`]} onChange={(value) => patch({ parcel: { ...form.parcel, [key]: value } })} />
  );
  const customsField = (key: string, label: string) => (
    <Field label={label} name={`customs.${key}`} value={form.customs[key] ?? ""} error={errors[`customs.${key}`]} onChange={(value) => patch({ customs: { ...form.customs, [key]: value } })} />
  );
  return (
    <>
      <Notice text={failure} kind="error" />
      <section className="admin-panel admin-section">
        <h2>How rates are worked out</h2>
        <label className="admin-field">
          <span>Rates at checkout</span>
          <select name="mode" value={form.mode} onChange={(event) => patch({ mode: event.target.value as ShippingSettings["mode"] })}>
            <option value="flat">Flat rates that I set</option>
            <option value="easypost">Live carrier rates from EasyPost</option>
          </select>
        </label>
        {form.mode === "easypost" && !settings.easypost_configured && (
          <p className="admin-attention" role="note">
            <strong>EasyPost isn't connected yet.</strong> Until its API key is added on the server, customers see your flat rates.
          </p>
        )}
        {form.mode === "easypost" && settings.easypost_configured && !settings.origin_complete && (
          <p className="admin-attention" role="note">
            <strong>Add your origin address below.</strong> Until it's complete, customers see your flat rates.
          </p>
        )}
        <p className="admin-help">If EasyPost is down or has no rate for an address, checkout uses your flat rates, and the order says so.</p>
        <Field label="Free shipping over (USD), or leave empty" name="free_shipping_threshold_cents" value={form.freeOver} error={errors.free_shipping_threshold_cents} onChange={(value) => patch({ freeOver: value })} />
        <p className="admin-help">Over this amount the cheapest option is free. You still pay the carrier.</p>
      </section>
      <section className="admin-panel admin-section">
        <h2>Flat rates</h2>
        {settings.flat_rates_placeholder && (
          <p className="admin-attention" role="note">
            <strong>These are placeholder rates.</strong> Customers would pay them as shown. Check each one, then save to make them yours.
          </p>
        )}
        <div className="admin-form-grid">
          {ZONES.map(([zone, label]) => (
            <Field key={zone} label={`${label} (USD)`} name={`flat_rates.${zone}`} value={form.rates[zone]} error={errors[`flat_rates.${zone}`]} onChange={(value) => patch({ rates: { ...form.rates, [zone]: value } })} />
          ))}
        </div>
      </section>
      <section className="admin-panel admin-section">
        <h2>Local pickup</h2>
        <label className="admin-checkbox">
          <input type="checkbox" checked={form.pickupEnabled} onChange={(event) => patch({ pickupEnabled: event.target.checked })} />
          Offer free pickup in Guam
        </label>
        <p className="admin-help">Shown only to customers with a Guam address.</p>
        <TextArea label="Pickup instructions" name="pickup_instructions" value={form.pickupInstructions} error={errors.pickup_instructions} onChange={(value) => patch({ pickupInstructions: value })} />
        <p className="admin-help">Customers see this at checkout, on their order page and in their emails.</p>
      </section>
      <section className="admin-panel admin-section">
        <h2>EasyPost</h2>
        <p className="admin-help">
          {settings.easypost_configured ? "EasyPost is connected." : "EasyPost isn't connected yet."}{" "}
          {settings.easypost_webhook_configured ? "Delivery updates are on." : "Delivery updates start once its webhook secret is added."}
        </p>
        <Field label="Carriers to offer, separated by commas (empty means all)" name="carriers" value={form.carriers} error={errors.carriers} onChange={(value) => patch({ carriers: value })} />
        <Field label="Handling fee added to live rates (USD)" name="handling_fee_cents" value={form.handling} error={errors.handling_fee_cents} onChange={(value) => patch({ handling: value })} />
        <h3 className="admin-subheading">Where orders ship from</h3>
        <div className="admin-form-grid">
          {originField("name", "Contact name")}
          {originField("company", "Business name")}
          {originField("phone", "Phone")}
          {originField("line1", "Address")}
          {originField("line2", "Suite or unit")}
          {originField("city", "City")}
          {originField("state", "State or territory code")}
          {originField("postal_code", "ZIP code")}
        </div>
        <h3 className="admin-subheading">Default box</h3>
        <p className="admin-help">Used for any product without its own measurements. Weights add up across the order, heights add up as boxes stack, and the largest length and width are used.</p>
        <div className="admin-form-grid">
          {parcelField("weight_oz", "Weight (oz)")}
          {parcelField("length_in", "Length (in)")}
          {parcelField("width_in", "Width (in)")}
          {parcelField("height_in", "Height (in)")}
        </div>
        <h3 className="admin-subheading">Customs details</h3>
        <p className="admin-help">Carriers need these for Guam, the other territories and military addresses, even though no duty is due. Check where your puzzles are really made: the country of origin has to be true.</p>
        <div className="admin-form-grid">
          {customsField("description", "What's in the box")}
          {customsField("hs_tariff_number", "HS tariff number")}
          {customsField("origin_country", "Country of origin (two letters)")}
          {customsField("signer", "Name signing the customs form")}
        </div>
      </section>
      <section className="admin-panel admin-section">
        <h2>Tax</h2>
        <label className="admin-checkbox">
          <input type="checkbox" checked={form.tax} onChange={(event) => patch({ tax: event.target.checked })} />
          Collect tax at payment with Stripe Tax
        </label>
        <p className="admin-help">Leave this off until Stripe Tax is set up on your Stripe account and your tax registrations are added there. Tax is worked out on Stripe's payment page, from the billing address, and added on top of the order.</p>
      </section>
      <button className="admin-button" disabled={saving || (!dirty && !settings.flat_rates_placeholder)} onClick={() => void save()}>
        {saving ? "Saving…" : settings.flat_rates_placeholder ? "Save shipping and confirm these rates" : "Save shipping"}
      </button>
    </>
  );
}

const METHOD_NOTES: Record<string, string> = {
  live: "Live rate from EasyPost.",
  flat: "Your flat rate.",
  flat_fallback: "Your flat rate. EasyPost was unavailable at checkout, so it was used instead.",
  pickup: "The customer picks this up in Guam.",
};
export function ShippingSummary({ order }: { order: OrderDetail }) {
  const method = order.shipping_method;
  if (!method) return null;
  return (
    <p className="admin-help">
      <strong>{method.label}</strong>. {METHOD_NOTES[method.kind ?? ""] ?? ""}
      {method.cost_cents != null && <> The carrier quoted <Money cents={method.cost_cents} />.</>}
      {method.instructions && <> {method.instructions}</>}
    </p>
  );
}
const trackingLabel = (status: string) => status.replaceAll("_", " ");
// Only ever opens the carrier's own pages, so a bad value can't become a link.
const safeLink = (url?: string | null) => (url && /^https:\/\//.test(url) ? url : null);
export function LabelPanel({ order, busy, reload, fulfill }: { order: OrderDetail; busy: boolean; reload: () => void; fulfill: () => void }) {
  const api = useAdminApi();
  const [buying, setBuying] = useState(false);
  const [failure, setFailure] = useState("");
  const endpoint = `/orders/${encodeURIComponent(order.number)}/label`;
  async function buy(confirmCents?: number) {
    setBuying(true);
    setFailure("");
    try {
      await api(endpoint, { method: "POST", body: confirmCents === undefined ? {} : { confirm_cents: confirmCents } });
      reload();
    } catch (cause) {
      const details = cause instanceof AdminApiError ? cause.body.details : undefined;
      const current = details?.current_cents;
      if (cause instanceof AdminApiError && cause.body.code === "label_price_changed" && typeof current === "number") {
        if (window.confirm(cause.body.message)) return void (await buy(current));
      } else {
        setFailure(issue(cause));
      }
    } finally {
      setBuying(false);
    }
  }
  const label = safeLink(order.label_url);
  return (
    <div className="admin-label-panel">
      {order.tracking_status && (
        <p>
          Delivery status: <strong>{trackingLabel(order.tracking_status)}</strong>
          {order.tracking_status_at && <> (<DateText value={order.tracking_status_at} />)</>}
        </p>
      )}
      {order.label_status === "bought" ? (
        <>
          <p>
            Label bought{order.label_cost_cents != null && <> for <Money cents={order.label_cost_cents} /></>}.
            {order.tracking_number && <> Tracking: {order.tracking_number}.</>}
          </p>
          {label && <a className="admin-button secondary" href={label} target="_blank" rel="noreferrer">Print label</a>}
          {order.fulfillment_status === "unfulfilled" && order.status === "paid" && (
            <button className="admin-button" disabled={busy} onClick={fulfill}>Mark fulfilled and email the customer</button>
          )}
        </>
      ) : order.label_available ? (
        <>
          <button className="admin-button secondary" disabled={buying || busy} onClick={() => void buy()}>
            {buying ? "Buying label…" : "Buy label"}
          </button>
          <p className="admin-help">Buys from your EasyPost account. It can only buy one label for this order, and it asks first if the price has changed.</p>
        </>
      ) : null}
      <Notice text={failure} kind="error" />
    </div>
  );
}
