import { useEffect, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import { api, ApiError, checkoutFix } from "../api";
import { useCart } from "../cart";
import { checkoutFingerprint, clearAttempt, readAttempt, saveAttempt, type CheckoutShipping } from "../checkoutState";
import { paymentRedirect } from "../paymentRedirect";
import { rememberCheckout } from "../orderState";
import { addressErrors, cleanAddress, readAddress, saveAddress } from "../shippingAddress";
import type { ErrorBody, ShippingAddress, ShippingOption } from "../types";
import { money } from "../utils";
import { ArtImage } from "./ArtImage";
import { AddressStep, OptionList } from "./CheckoutSteps";
import { Modal } from "./Modal";
import { Quantity } from "./Shared";
type Step = "cart" | "address" | "options";
const STEP_TITLES: Record<Step, string> = { cart: "YOUR CART", address: "SHIPPING ADDRESS", options: "SHIPPING" };
const QUOTE_PROBLEMS = ["shipping_quote_expired", "shipping_quote_invalid"];
// A problem with an item or the store can only be fixed on the cart step.
const cartProblem = (body: ErrorBody) =>
  !!body.details?.product_slug || ["limit_exceeded", "sold_out", "insufficient_stock", "drop_not_live", "unknown_product", "store_closed", "empty_cart", "quantity_invalid", "invalid_email"].includes(body.code);
export function CartDrawer({ onClose }: { onClose: () => void }) {
  const cart = useCart();
  const client = useQueryClient();
  const [email, setEmail] = useState(() => localStorage.getItem("tyt-email") || "");
  const [error, setError] = useState<ErrorBody | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [step, setStep] = useState<Step>("cart");
  const [address, setAddress] = useState<ShippingAddress>(readAddress);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({});
  const [addressFailure, setAddressFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  // Options belong to the cart they were priced for. A saved attempt brings its own choice back.
  const [quoted, setQuoted] = useState<{ revision: string; options: ShippingOption[] } | null>(() => {
    const saved = readAttempt();
    return saved?.shipping ? { revision: saved.cartRevision, options: [saved.shipping.option] } : null;
  });
  const [selected, setSelected] = useState<CheckoutShipping | null>(() => readAttempt()?.shipping ?? null);
  const options = quoted?.revision === cart.revision ? quoted.options : null;
  // A new step replaces what had focus, so its heading takes over. Keeps a screen reader in place too.
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current !== step) heading.current?.focus();
    shownStep.current = step;
  }, [step]);
  const shipping = options && selected && options.some((option) => option.quote === selected.option.quote) ? selected : null;
  const products = useQueries({
    queries: cart.items.map((i) => ({
      queryKey: ["product", i.product_slug],
      queryFn: () => api.product(i.product_slug),
      refetchOnMount: "always" as const,
    })),
  });
  const subtotal = cart.items.reduce(
    (sum, item, index) => sum + item.quantity * (products[index]?.data?.product.price_cents ?? 0),
    0
  );
  const loading = products.some((p) => p.isPending || p.isFetching);
  const known = products.flatMap((q) => (q.data ? [q.data.product] : []));
  const mixed = known.some((p) => p.preorder) && known.some((p) => !p.preorder);
  const savedAttempt = readAttempt();
  const canRetry =
    savedAttempt?.fingerprint === checkoutFingerprint(email, cart.items, shipping) &&
    savedAttempt?.cartRevision === cart.revision;
  const invalid = products.some(
    (q, index) =>
      q.isError ||
      !q.data?.product.availability.purchasable ||
      cart.items[index].quantity > q.data.product.max_per_order
  );
  function change(slug: string, quantity: number, max: number) {
    cart.set(slug, quantity, max);
    setError(null);
  }
  function changeAddress(field: keyof ShippingAddress, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setAddressFailure("");
  }
  function sortedItems() {
    return [...cart.items].sort((a, b) => a.product_slug.localeCompare(b.product_slug));
  }
  async function requestOptions(target: ShippingAddress, keepLabel?: string) {
    const result = await api.shippingQuotes(sortedItems(), target);
    setQuoted({ revision: cart.revision, options: result.options });
    setTaxEnabled(!!result.tax_enabled);
    const choice = result.options.find((option) => option.label === keepLabel) ?? result.options[0];
    setSelected(choice ? { option: choice, address: target } : null);
  }
  async function submitAddress() {
    if (submitting.current) return;
    const target = cleanAddress(address);
    setAddress(target);
    const problems = addressErrors(target);
    setFieldErrors(problems);
    setAddressFailure("");
    if (Object.keys(problems).length) {
      setAddressFailure("Check the highlighted fields.");
      return;
    }
    saveAddress(target);
    submitting.current = true;
    setBusy(true);
    try {
      await requestOptions(target, selected?.option.label);
      setError(null);
      setNotice("");
      setStep("options");
    } catch (err) {
      const body = err instanceof ApiError ? err.body : null;
      if (body?.details?.fields) {
        setFieldErrors(body.details.fields);
        setAddressFailure("Check the highlighted fields.");
      } else if (body && cartProblem(body)) {
        setError(body);
        setStep("cart");
        void client.invalidateQueries({ queryKey: ["product"] });
      } else {
        setAddressFailure(body?.message ?? "We couldn’t connect. Your cart is safe. Please try again.");
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  async function refreshOptions(attemptKey: string, target: CheckoutShipping) {
    clearAttempt(attemptKey);
    try {
      await requestOptions(target.address, target.option.label);
      setNotice("Shipping options were refreshed. Check the price, then continue.");
    } catch {
      setQuoted(null);
      setSelected(null);
      setAddressFailure("We couldn’t refresh your shipping options. Please try again.");
      setStep("address");
    }
  }
  async function checkout() {
    if (submitting.current || !shipping) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    localStorage.setItem("tyt-email", email);
    const checkoutItems = sortedItems();
    const fingerprint = checkoutFingerprint(email, checkoutItems, shipping);
    const saved = readAttempt();
    const attempt =
      saved?.fingerprint === fingerprint && saved.cartRevision === cart.revision
        ? saved
        : { fingerprint, key: crypto.randomUUID(), cartRevision: cart.revision, items: checkoutItems, shipping };
    saveAttempt(attempt);
    // A new shipping choice for this same cart replaces its checkout, so that hold can't block this
    // one. A changed cart is a separate purchase: the earlier checkout may still be paid in another tab.
    if (saved?.orderToken && saved.key !== attempt.key && saved.cartRevision === cart.revision)
      await api.cancel(saved.orderToken).catch(() => undefined);
    const chosen = attempt.shipping ?? shipping;
    try {
      const result = await api.checkout(email.trim(), checkoutItems, attempt.key, { quote: chosen.option.quote, address: chosen.address });
      rememberCheckout(result.order.token, attempt);
      const redirect = paymentRedirect(result.payment_url);
      if (!redirect)
        throw new ApiError(
          {
            code: "unsafe_payment_url",
            message: "We couldn’t open a secure payment page. Your cart is safe. Please try again.",
          },
          502
        );
      window.location.assign(redirect);
    } catch (err) {
      const body =
        err instanceof ApiError
          ? err.body
          : { code: "network", message: "We couldn’t connect. Your cart is safe. Please try again." };
      if (body.code === "idempotency_conflict" || body.details?.retry === "new_checkout") clearAttempt(attempt.key);
      if (QUOTE_PROBLEMS.includes(body.code)) await refreshOptions(attempt.key, shipping);
      else if (body.details?.fields) {
        setFieldErrors(body.details.fields);
        setAddressFailure("Check the highlighted fields.");
        setStep("address");
      } else {
        setError(body);
        if (cartProblem(body)) setStep("cart");
      }
      setBusy(false);
      submitting.current = false;
      void client.invalidateQueries({ queryKey: ["product"] });
    }
  }
  const total = subtotal + (shipping?.option.amount_cents ?? 0);
  const errorMessage = error && (
    <p className="error" id="checkout-error" role={error.details?.product_slug ? undefined : "alert"}>
      {error.details?.product_slug
        ? "Please update the item above to continue."
        : error.code === "limit_exceeded" && !error.details?.product_slug
          ? `${checkoutFix(error).message} Update quantities or remove an item to continue.`
          : error.message}
    </p>
  );
  const previous: Step | null = step === "options" ? "address" : step === "address" ? "cart" : null;
  return (
    <Modal label="Your cart" onClose={onClose} className="cart-dialog" swipeToDismiss>
      {(close) => (
      <div className="drawer-content">
        <div className="drawer-header">
          {previous && (
            <button
              className="text-button drawer-back"
              disabled={busy}
              onClick={() => {
                setStep(previous);
                setNotice("");
                setError(null);
              }}
            >
              <ChevronLeft size={16} aria-hidden="true" /> BACK
            </button>
          )}
          <h2 ref={heading} tabIndex={-1}>
            {STEP_TITLES[step]} {step === "cart" && <span className="muted">({cart.items.reduce((s, i) => s + i.quantity, 0)})</span>}
          </h2>
          <button className="text-button" onClick={close}>
            CLOSE
          </button>
        </div>
        {cart.items.length === 0 ? (
          <div className="empty-cart">
            <p>A piece of home is waiting.</p>
            <Link to="/shop" onClick={close} className="button">
              EXPLORE THE COLLECTION
            </Link>
          </div>
        ) : step === "address" ? (
          <AddressStep address={address} errors={fieldErrors} failure={addressFailure} busy={busy} onChange={changeAddress} onSubmit={() => void submitAddress()} />
        ) : step === "options" ? (
          <form
            className="checkout-step"
            onSubmit={(e) => {
              e.preventDefault();
              void checkout();
            }}
          >
            {shipping && (
              <p className="small checkout-ship-to">
                <strong>{shipping.option.kind === "pickup" ? "Your details" : "Shipping to"}</strong>
                <br />
                {shipping.address.name}, {shipping.address.line1}
                {shipping.address.line2 && `, ${shipping.address.line2}`}, {shipping.address.city}, {shipping.address.state} {shipping.address.postal_code}
              </p>
            )}
            <OptionList
              options={options ?? []}
              selected={shipping?.option.quote ?? null}
              disabled={busy}
              onSelect={(option) => {
                if (shipping) setSelected({ option, address: shipping.address });
                setError(null);
                setNotice("");
              }}
            />
            {notice && <p className="error" role="status">{notice}</p>}
            <dl className="price-lines">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div>
                <dt>{shipping?.option.kind === "pickup" ? "Pickup" : "Shipping"}</dt>
                <dd>{shipping?.option.amount_cents ? money(shipping.option.amount_cents) : "Free"}</dd>
              </div>
              {taxEnabled && (
                <div>
                  <dt>Tax</dt>
                  <dd className="muted">Added at payment</dd>
                </div>
              )}
            </dl>
            <div className="subtotal">
              <span>Total{taxEnabled ? " before tax" : ""}</span>
              <span>{money(total)}</span>
            </div>
            {mixed && <p className="small">This cart includes a preorder, so your whole order may ship together when the preorder is ready.</p>}
            {errorMessage}
            <button className="button" disabled={busy || !shipping}>
              {busy
                ? "Reserving your order…"
                : error?.details?.retry === "new_checkout"
                  ? "Start a new checkout"
                  : canRetry && error
                    ? "Try again"
                    : "CONTINUE TO PAYMENT"}
            </button>
            <p className="muted small">Your order is held for about 30 minutes at checkout.</p>
          </form>
        ) : (
          <>
            <div className="cart-lines">
              {cart.items.map((item, index) => {
                const query = products[index];
                const p = query.data?.product;
                const affected =
                  error?.details?.product_slug === item.product_slug ||
                  (error && !error.details?.product_slug && cart.items.length === 1 && error.code === "limit_exceeded");
                const lineError = affected && error ? checkoutFix(error) : null;
                const max = p?.max_per_order ?? 10;
                return (
                  <div className="cart-line" key={item.product_slug}>
                    {p && <ArtImage art={p.image} sizes="96px" />}
                    <div className="cart-line-info">
                      <Link onClick={close} to={`/products/${item.product_slug}`}>
                        {p?.name ?? (query.isPending ? "Loading…" : item.product_slug)}
                      </Link>
                      {p && <p className="price">{money(p.price_cents)}</p>}
                      {p?.preorder && p.preorder_ships && <p className="preorder-note"><strong>Preorder.</strong> {p.preorder_ships}</p>}
                      <div className="cart-line-controls">
                        <Quantity
                          value={item.quantity}
                          max={max}
                          onChange={(n) => change(item.product_slug, n, max)}
                          label={`Quantity for ${p?.name ?? "item"}`}
                          disabled={busy}
                        />
                        <button
                          className="text-button remove"
                          disabled={busy}
                          onClick={() => {
                            cart.remove(item.product_slug);
                            setError(null);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      {p && !canRetry && !p.availability.purchasable && (
                        <p className="line-error">
                          {p.availability.state === "upcoming"
                            ? "This drop hasn’t released yet."
                            : "This item is currently unavailable."}{" "}
                          Remove it to continue.
                        </p>
                      )}
                      {p && !canRetry && p.availability.purchasable && item.quantity > max && (
                        <p className="line-error">
                          The available quantity changed.{" "}
                          <button
                            className="inline-link"
                            disabled={busy}
                            onClick={() => change(item.product_slug, max, max)}
                          >
                            Reduce to {max}
                          </button>
                        </p>
                      )}
                      {query.isError && (
                        <p className="line-error">
                          {query.error instanceof ApiError && query.error.status === 404 ? (
                            "This item is no longer available. Remove it to continue."
                          ) : (
                            <>
                              <span>Couldn’t check availability. </span>
                              <button className="inline-link" onClick={() => void query.refetch()}>
                                Try again
                              </button>
                            </>
                          )}
                        </p>
                      )}
                      {lineError && (
                        <p role="alert" className="line-error">
                          {lineError.message}
                          {lineError.remove || lineError.quantity === 0 ? (
                            <button
                              className="inline-link"
                              onClick={() => {
                                cart.remove(item.product_slug);
                                setError(null);
                              }}
                            >
                              Remove
                            </button>
                          ) : lineError.quantity !== undefined ? (
                            <button
                              className="inline-link"
                              onClick={() => change(item.product_slug, lineError.quantity!, max)}
                            >
                              Reduce to {lineError.quantity}
                            </button>
                          ) : null}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="cart-summary"
              onSubmit={(e) => {
                e.preventDefault();
                // A saved attempt already holds stock and its shipping choice, so it goes straight back.
                if (canRetry) void checkout();
                else {
                  localStorage.setItem("tyt-email", email);
                  setError(null);
                  setStep("address");
                }
              }}
            >
              <div className="subtotal">
                <span>Subtotal</span>
                <span>{loading ? "Checking…" : money(subtotal)}</span>
              </div>
              <p className="muted small">Shipping is calculated next, from your address.</p>
              {mixed && <p className="small">This cart includes a preorder, so your whole order may ship together when the preorder is ready.</p>}
              <label htmlFor="checkout-email">Email address</label>
              <input
                id="checkout-email"
                required
                type="email"
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                aria-invalid={error?.code === "invalid_email"}
                aria-describedby={error ? "checkout-error" : undefined}
              />
              {errorMessage}
              {canRetry && shipping && (
                <p className="small checkout-ship-to">
                  {shipping.option.label}, to {shipping.address.city}, {shipping.address.state}.{" "}
                  <button
                    type="button"
                    className="inline-link"
                    disabled={busy}
                    onClick={() => {
                      setSelected(null);
                      setStep("address");
                    }}
                  >
                    Change
                  </button>
                </p>
              )}
              <button className="button" disabled={busy || (!canRetry && (loading || invalid))}>
                {busy
                  ? "Reserving your order…"
                  : error?.details?.retry === "new_checkout"
                    ? "Start a new checkout"
                    : canRetry && error
                      ? "Try again"
                      : "CHECKOUT"}
              </button>
              <p className="muted small">Your order is held for about 30 minutes at checkout.</p>
            </form>
          </>
        )}
      </div>
      )}
    </Modal>
  );
}
