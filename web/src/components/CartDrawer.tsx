import { useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, ApiError, checkoutFix } from "../api";
import { useCart } from "../cart";
import { rememberCheckout } from "../orderState";
import type { ErrorBody } from "../types";
import { money } from "../utils";
import { ArtImage } from "./ArtImage";
import { Modal } from "./Modal";
import { Quantity } from "./Shared";
export function CartDrawer({ onClose }: { onClose: () => void }) {
  const cart = useCart();
  const client = useQueryClient();
  const [email, setEmail] = useState(() => localStorage.getItem("tyt-email") || "");
  const [error, setError] = useState<ErrorBody | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
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
  async function checkout() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    localStorage.setItem("tyt-email", email);
    const checkoutItems = [...cart.items].sort((a, b) => a.product_slug.localeCompare(b.product_slug));
    const fingerprint = JSON.stringify({ email: email.trim().toLowerCase(), items: checkoutItems });
    let saved: { fingerprint: string; key: string } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem("tyt-checkout-attempt") || "null");
    } catch {
      /* A corrupt old attempt is replaced. */
    }
    const key = saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
    sessionStorage.setItem("tyt-checkout-attempt", JSON.stringify({ fingerprint, key }));
    try {
      const result = await api.checkout(email.trim(), checkoutItems, key);
      rememberCheckout(result.order.token, checkoutItems);
      window.location.assign(result.payment_url);
    } catch (err) {
      const body =
        err instanceof ApiError
          ? err.body
          : { code: "network", message: "We couldn’t connect. Your cart is safe. Please try again." };
      if (body.code === "idempotency_conflict") sessionStorage.removeItem("tyt-checkout-attempt");
      setError(body);
      setBusy(false);
      submitting.current = false;
      void client.invalidateQueries({ queryKey: ["product"] });
    }
  }
  return (
    <Modal label="Your cart" onClose={onClose} className="cart-dialog">
      <div className="drawer-content">
        <div className="drawer-header">
          <h2>
            YOUR CART <span className="muted">({cart.items.reduce((s, i) => s + i.quantity, 0)})</span>
          </h2>
          <button className="text-button" onClick={onClose}>
            CLOSE
          </button>
        </div>
        {cart.items.length === 0 ? (
          <div className="empty-cart">
            <p>A piece of home is waiting.</p>
            <Link to="/shop" onClick={onClose} className="button">
              EXPLORE THE COLLECTION
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-lines">
              {cart.items.map((item, index) => {
                const query = products[index];
                const p = query.data?.product;
                const lineError = error?.details?.product_slug === item.product_slug ? checkoutFix(error) : null;
                const max = p?.max_per_order ?? 10;
                return (
                  <div className="cart-line" key={item.product_slug}>
                    {p && <ArtImage art={p.image} sizes="96px" />}
                    <div className="cart-line-info">
                      <Link onClick={onClose} to={`/products/${item.product_slug}`}>
                        {p?.name ?? (query.isPending ? "Loading puzzle…" : item.product_slug)}
                      </Link>
                      {p && <p className="price">{money(p.price_cents)}</p>}
                      <div className="cart-line-controls">
                        <Quantity
                          value={item.quantity}
                          max={max}
                          onChange={(n) => change(item.product_slug, n, max)}
                          label={`Quantity for ${p?.name ?? "puzzle"}`}
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
                      {p && !p.availability.purchasable && (
                        <p className="line-error">
                          {p.availability.state === "upcoming"
                            ? "This drop hasn’t released yet."
                            : "This puzzle is currently unavailable."}{" "}
                          Remove it to continue.
                        </p>
                      )}
                      {p && p.availability.purchasable && item.quantity > max && (
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
                            "This puzzle is no longer available. Remove it to continue."
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
                void checkout();
              }}
            >
              <div className="subtotal">
                <span>Subtotal</span>
                <span>{loading ? "Checking…" : money(subtotal)}</span>
              </div>
              <p className="muted small">Shipping calculated at checkout.</p>
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
              {error && (
                <p className="error" id="checkout-error" role={error.details?.product_slug ? undefined : "alert"}>
                  {error.details?.product_slug ? "Please update the item above to continue." : error.message}
                </p>
              )}
              <button className="button" disabled={busy || loading || invalid}>
                {busy ? "Reserving your order…" : "CHECKOUT"}
              </button>
              <p className="muted small">Your puzzles are held for about 30 minutes at checkout.</p>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
