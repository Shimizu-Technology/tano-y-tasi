import { MILITARY_STATES, STATE_GROUPS } from "../shippingAddress";
import type { ShippingAddress, ShippingOption } from "../types";
import { money } from "../utils";

type Errors = Partial<Record<keyof ShippingAddress, string>>;

function AddressField({
  field,
  label,
  autoComplete,
  value,
  error,
  disabled,
  onChange,
  hint,
  ...input
}: {
  field: keyof ShippingAddress;
  label: string;
  autoComplete: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
  inputMode?: "numeric" | "tel";
  maxLength?: number;
}) {
  const id = `shipping-${field}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ");
  return (
    <div className="checkout-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id}
        name={field}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
      />
      {hint && <p className="muted small" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function AddressStep({
  address,
  errors,
  failure,
  busy,
  onChange,
  onSubmit,
}: {
  address: ShippingAddress;
  errors: Errors;
  failure: string;
  busy: boolean;
  onChange: (field: keyof ShippingAddress, value: string) => void;
  onSubmit: () => void;
}) {
  const field = (name: keyof ShippingAddress) => ({
    field: name,
    value: address[name],
    error: errors[name],
    disabled: busy,
    onChange: (value: string) => onChange(name, value),
  });
  const military = MILITARY_STATES.has(address.state);
  return (
    <form
      className="checkout-step"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <AddressField {...field("name")} label="Full name" autoComplete="shipping name" maxLength={100} />
      <AddressField {...field("line1")} label="Address" autoComplete="shipping address-line1" maxLength={100} />
      <AddressField {...field("line2")} label="Apartment, suite or unit (optional)" autoComplete="shipping address-line2" maxLength={100} />
      <AddressField
        {...field("city")}
        label="City"
        autoComplete="shipping address-level2"
        maxLength={60}
        hint={military ? "For a military address, use APO, FPO or DPO." : undefined}
      />
      <div className="checkout-field-row">
        <div className="checkout-field">
          <label htmlFor="shipping-state">State or territory</label>
          <select
            id="shipping-state"
            name="state"
            autoComplete="shipping address-level1"
            value={address.state}
            disabled={busy}
            onChange={(event) => onChange("state", event.target.value)}
            aria-invalid={!!errors.state}
            aria-describedby={errors.state ? "shipping-state-error" : undefined}
          >
            <option value="">Choose one</option>
            {STATE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.states.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors.state && <p className="error" id="shipping-state-error">{errors.state}</p>}
        </div>
        <AddressField {...field("postal_code")} label="ZIP code" autoComplete="shipping postal-code" inputMode="numeric" maxLength={10} />
      </div>
      <AddressField
        {...field("phone")}
        label="Phone (optional)"
        autoComplete="shipping tel"
        type="tel"
        inputMode="tel"
        maxLength={30}
        hint="Only for delivery questions."
      />
      {failure && <p className="error" role="alert">{failure}</p>}
      <button className="button" disabled={busy}>
        {busy ? "Finding shipping options…" : "SEE SHIPPING OPTIONS"}
      </button>
    </form>
  );
}

export function OptionList({
  options,
  selected,
  disabled,
  onSelect,
}: {
  options: ShippingOption[];
  selected: string | null;
  disabled: boolean;
  onSelect: (option: ShippingOption) => void;
}) {
  return (
    <fieldset className="shipping-options">
      <legend>Choose how to get it</legend>
      {options.map((option) => (
        <label className="shipping-option" key={option.quote}>
          <input
            type="radio"
            name="shipping-option"
            checked={selected === option.quote}
            disabled={disabled}
            onChange={() => onSelect(option)}
          />
          <span className="shipping-option-text">
            <strong>{option.label}</strong>
            {option.estimate && <span className="muted small">{option.estimate}</span>}
            {option.instructions && <span className="muted small">{option.instructions}</span>}
          </span>
          <span className="price">{option.amount_cents === 0 ? "Free" : money(option.amount_cents)}</span>
        </label>
      ))}
    </fieldset>
  );
}
