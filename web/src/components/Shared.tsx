import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { ArtImage } from "./ArtImage";
import type { Product } from "../types";
import { dropNumber, money, releaseDate, releaseTimes, countdown, remainingMs } from "../utils";
export function Meta({
  title,
  description = "Premium puzzles of Guåhan. A piece of home, wherever you are.",
}: {
  title: string;
  description?: string;
}) {
  return (
    <>
      <title>{`${title} — Tåno + Tåsi`}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={`${title} — Tåno + Tåsi`} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content="/images/brand/og-image.jpg" />
      <meta property="og:type" content="website" />
    </>
  );
}
export function Wordmark() {
  return <img className="wordmark" src="/images/brand/wordmark-ink-360.webp" srcSet="/images/brand/wordmark-ink-360.webp 360w, /images/brand/wordmark-ink-720.webp 720w" sizes="(min-width: 900px) 136px, 132px" width="360" height="116" alt="TÅNO + TÅSI — Island Supply Co." />;
}
export function Loading({ layout = "page" }: { layout?: "home" | "collection" | "product" | "drop" | "archive" | "page" }) {
  const product = layout === "product" || layout === "drop";
  return (
    <div className={`loading-layout loading-${layout}`} role="status" aria-label="Loading the collection">
      <span className="sr-only">Loading the collection…</span>
      <div aria-hidden="true">
        {layout === "home" ? (
          <>
            {/* Same grid as the home hero, so the real page replaces it without moving. */}
            <div className="home-hero">
              <div className="home-hero-copy">
                <div className="skeleton skeleton-emblem" /><div className="skeleton skeleton-headline" /><div className="skeleton skeleton-mission" />
              </div>
              <div className="home-hero-art"><div className="skeleton skeleton-hero-art" /></div>
              <div className="home-hero-actions"><div className="skeleton skeleton-button" /></div>
            </div>
          </>
        ) : product ? (
          <div className="product-page">
            <div className="product-breadcrumb"><div className="skeleton skeleton-line" /></div>
            <div className="product-layout">
              <div className={`skeleton skeleton-product-art ${layout === "drop" ? "skeleton-map-art" : ""}`} />
              <div className="product-info"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-copy" /><div className="skeleton skeleton-button" /></div>
            </div>
          </div>
        ) : (
          <div className="page">
            <div className="page-heading"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-line" /></div>
            {layout === "collection" || layout === "archive" ? <div className="skeleton-tiles"><div className="skeleton tile" /><div className="skeleton tile" /></div> : <div className="skeleton skeleton-copy" />}
          </div>
        )}
      </div>
    </div>
  );
}
export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <section className="page narrow">
      <h1>{error instanceof ApiError && error.status === 404 ? "Not found" : "The shop is taking a moment."}</h1>
      <p>{error instanceof ApiError ? error.message : "We couldn’t connect. Please try again."}</p>
      <button className="button" onClick={retry}>
        TRY AGAIN
      </button>{" "}
      <Link className="text-link" to="/shop">
        Back to shop
      </Link>
    </section>
  );
}
// The line under a product card: what's going on with it, then what it is.
function cardLabel(product: Product) {
  const { state } = product.availability;
  const status =
    state === "coming_soon"
      ? "COMING SOON"
      : state === "sold_out"
        ? "SOLD OUT"
        : state === "closed"
          ? "DROP CLOSED"
          : state === "preorder"
            ? "PREORDER"
            : product.drop
              ? product.drop.state === "upcoming"
                ? product.drop.release_at
                  ? `COMING ${releaseDate(product.drop.release_at).toUpperCase()}`
                  : "COMING SOON"
                : `DROP ${dropNumber(product.drop.number)}`
              : null;
  const pieces = product.specs?.piece_count != null ? `${product.specs.piece_count} PIECES` : null;
  if (product.signature) return ["SIGNATURE", status ?? pieces].filter(Boolean).join(" · ");
  return status ?? (pieces ? `${pieces} · CORE COLLECTION` : "CORE COLLECTION");
}
export function ProductCard({ product }: { product: Product }) {
  // The price of an unannounced drop isn't confirmed yet.
  const unannounced = product.drop?.state === "upcoming" && !product.drop.release_at;
  return (
    <Link className="product-card" to={`/products/${product.slug}`}>
      <div className="tile">
        <ArtImage art={product.image} />
      </div>
      <div className="card-caption">
        <p>{product.name}</p>
        {!unannounced && <span className="price">{money(product.price_cents)}</span>}
      </div>
      <p className="label muted">{cardLabel(product)}</p>
    </Link>
  );
}
export function Signup({ source = "home", dropSlug, inline = false, cta = "SIGN UP" }: { source?: string; dropSlug?: string; inline?: boolean; cta?: string }) {
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: () => api.subscribe(email, source, dropSlug) });
  const id = `signup-${source}`;
  return (
    <section className={`signup${inline ? " signup-inline" : ""}`} id="notify" aria-label={inline ? "Drop alerts" : undefined}>
      {!inline && (
        <div>
          <h2>New drops, first.</h2>
          <p className="muted">No spam. Just a piece of home.</p>
        </div>
      )}
      {mutation.isSuccess ? (
        <p role="status" className="signup-success">
          You’re on the list. We’ll keep you posted.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="sr-only" htmlFor={id}>
            Email for drop alerts
          </label>
          <div className="signup-fields">
            <input
              id={id}
              type="email"
              required
              autoComplete="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                mutation.reset();
              }}
              aria-invalid={mutation.isError}
              aria-describedby={mutation.isError ? `${id}-error` : undefined}
            />
            <button disabled={mutation.isPending} className="button">
              {mutation.isPending ? "SIGNING UP…" : cta}
            </button>
          </div>
          {mutation.isError && (
            <p id={`${id}-error`} className="error" role="alert">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "Couldn’t save your email. Please try again."}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
export function ReleaseTimes({ iso }: { iso: string }) {
  const times = releaseTimes(iso);
  return (
    <div className="release-times">
      <p>
        <time dateTime={iso}>{times.guam}</time>
      </p>
      <p className="muted">
        {times.pacific}
        <br />
        {times.hawaii}
      </p>
    </div>
  );
}
export function Countdown({
  release,
  serverTime,
  receivedAt,
}: {
  release: string;
  serverTime: string;
  receivedAt: number;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const value = countdown(remainingMs(release, serverTime, receivedAt, now));
  return value ? (
    <p className="label countdown" aria-label="Time until release">
      RELEASES IN {value}
    </p>
  ) : null;
}
export function Quantity({
  value,
  max,
  onChange,
  label = "Quantity",
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="quantity" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
      >
        <Minus aria-hidden="true" />
      </button>
      <output aria-label={label}>{value}</output>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
