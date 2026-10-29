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
  return <span className="wordmark">TÅNO + TÅSI</span>;
}
export function Loading() {
  return (
    <div className="page loading" role="status">
      Loading the collection…
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
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" to={`/products/${product.slug}`}>
      <div className="tile">
        <ArtImage art={product.image} />
      </div>
      <div className="card-caption">
        <p>{product.name}</p>
        <span className="price">{money(product.price_cents)}</span>
      </div>
      <p className="label muted">
        {product.availability.state === "sold_out"
          ? "SOLD OUT"
          : product.availability.state === "closed"
            ? "DROP CLOSED"
            : product.drop
              ? product.drop.state === "upcoming"
                ? `COMING ${releaseDate(product.drop.release_at).toUpperCase()}`
                : `DROP ${dropNumber(product.drop.number)}`
              : "100 PIECES · CORE COLLECTION"}
      </p>
    </Link>
  );
}
export function Signup({ source = "home", dropSlug }: { source?: string; dropSlug?: string }) {
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: () => api.subscribe(email, source, dropSlug) });
  const id = `signup-${source}`;
  return (
    <section className="signup" id="notify">
      <div>
        <p className="label">DROP ALERTS</p>
        <h2>New drops, first.</h2>
        <p className="muted">No spam. Just a piece of home.</p>
      </div>
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
              {mutation.isPending ? "SIGNING UP…" : "SIGN UP"}
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
        −
      </button>
      <output aria-label={label}>{value}</output>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
      >
        +
      </button>
    </div>
  );
}
