import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { useCart } from "../cart";
import { useOpenCart } from "../components/Layout";
import { Gallery } from "../components/Gallery";
import { Countdown, Failure, Loading, Meta, Quantity, ReleaseTimes, Signup } from "../components/Shared";
import { dropNumber, money, purchaseState, releaseDate } from "../utils";
import type { Drop, ProductDetail } from "../types";
export function ProductPage() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["product", slug], queryFn: () => api.product(slug!) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  return (
    <ProductView
      key={q.data.product.slug}
      product={q.data.product}
      serverTime={q.data.server_time}
      receivedAt={q.dataUpdatedAt}
    />
  );
}
export function DropPage() {
  const { slug } = useParams();
  const q = useQuery({
    queryKey: ["drop", slug ?? "featured"],
    queryFn: async () => {
      if (slug) {
        const data = await api.drop(slug);
        return { ...data, receivedAt: Date.now() };
      }
      const data = await api.drops();
      const selected = data.current ?? data.upcoming[0] ?? data.archive[0];
      if (!selected) return { drop: null, server_time: data.server_time, receivedAt: Date.now() };
      const detail = await api.drop(selected.slug);
      return { ...detail, receivedAt: Date.now() };
    },
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  if (!q.data.drop)
    return (
      <div className="page empty-page">
        <Meta title="Drops" />
        <h1>Something is on the horizon.</h1>
        <Signup source="drop" />
      </div>
    );
  const d = q.data.drop;
  return (
    <ProductView
      key={d.slug}
      product={d.product}
      drop={d}
      serverTime={q.data.server_time}
      receivedAt={q.data.receivedAt}
    />
  );
}
function ProductView({
  product: p,
  drop,
  serverTime,
  receivedAt,
}: {
  product: ProductDetail;
  drop?: Drop;
  serverTime: string;
  receivedAt: number;
}) {
  const [quantity, setQuantity] = useState(1);
  const [visible, setVisible] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  const seenButton = useRef(false);
  const add = useCart((s) => s.add);
  const items = useCart((s) => s.items);
  const openCart = useOpenCart();
  const d = drop ?? p.drop;
  const purchase = purchaseState(p);
  const inCart = items.find((i) => i.product_slug === p.slug)?.quantity ?? 0;
  const max = p.max_per_order;
  const room = Math.max(0, max - inCart);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) seenButton.current = true;
        setVisible(!seenButton.current || entry.isIntersecting);
      },
      { rootMargin: "-56px 0px 0px 0px" }
    );
    if (button.current) observer.observe(button.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (location.hash === "#notify") document.getElementById("notify")?.scrollIntoView();
  }, []);
  function buy() {
    if (room === 0) {
      openCart();
      return;
    }
    add(p.slug, Math.min(quantity, room), max);
    openCart();
  }
  const label = purchase.disabled ? purchase.label : room === 0 ? "VIEW CART" : purchase.label;
  return (
    <>
      <Meta title={d ? `Drop ${dropNumber(d.number)} — ${p.name}` : p.name} description={p.description} />
      <div className="product-page">
        <div className="product-breadcrumb label">
          <Link to={d ? "/archive" : "/shop"}>{d ? "THE DROPS" : "CORE COLLECTION"}</Link>
          <span> / </span>
          <span>{d ? `DROP ${dropNumber(d.number)}` : "THE PUZZLES"}</span>
        </div>
        <div className="product-layout">
          <Gallery images={p.images} name={p.name} />
          <div className="product-info">
            <p className="label product-state">
              {d ? (
                <>
                  {d.state === "live" && <span className="live-dot" />}DROP {dropNumber(d.number)} ·{" "}
                  {d.state === "live" ? "AVAILABLE NOW" : d.state.replace("_", " ").toUpperCase()}
                </>
              ) : (
                "CORE COLLECTION"
              )}
            </p>
            <h1>{p.name}</h1>
            <p className="product-price">{money(p.price_cents)}</p>
            <p className="product-description">{p.description}</p>
            {d && (
              <div className="drop-facts">
                {d.state === "upcoming" ? (
                  <>
                    <ReleaseTimes iso={d.release_at} />
                    <Countdown release={d.release_at} serverTime={serverTime} receivedAt={receivedAt} />
                  </>
                ) : d.state === "sold_out" ? (
                  <p>
                    Drop {dropNumber(d.number)} sold out{d.sold_out_at ? ` on ${releaseDate(d.sold_out_at)}` : ""}.
                  </p>
                ) : d.state === "closed" ? (
                  <p>This drop has closed.</p>
                ) : null}
                <p>
                  {d.quantity} made · Limit {d.per_customer_limit} per customer
                </p>
                <p className="muted small">One-time release. No restocks.</p>
              </div>
            )}
            {p.availability.low_stock && p.availability.remaining !== null && (
              <p className="small">Only {p.availability.remaining} left</p>
            )}
            <div className="buy-controls">
              {!purchase.disabled && room > 0 && (
                <Quantity value={Math.min(quantity, room)} max={room} onChange={setQuantity} />
              )}
              <button ref={button} className="button" onClick={buy} disabled={purchase.disabled}>
                {label}
              </button>
            </div>
            {inCart > 0 && !purchase.disabled && (
              <p className="muted small">
                {inCart} in your cart{d ? ` · Limit ${d.per_customer_limit}` : ""}
              </p>
            )}
            <div className="accordions">
              <details open>
                <summary>Details</summary>
                <dl>
                  <div>
                    <dt>Pieces</dt>
                    <dd>{p.specs.piece_count}</dd>
                  </div>
                  <div>
                    <dt>Finished size</dt>
                    <dd>{p.specs.finished_size}</dd>
                  </div>
                  <div>
                    <dt>Box size</dt>
                    <dd>{p.specs.box_size}</dd>
                  </div>
                  <div>
                    <dt>Material</dt>
                    <dd>{p.specs.material}</dd>
                  </div>
                  <div>
                    <dt>Cut</dt>
                    <dd>{p.specs.cut}</dd>
                  </div>
                  <div>
                    <dt>Made in</dt>
                    <dd>{p.specs.made_in}</dd>
                  </div>
                </dl>
                {p.placeholders.length > 0 && (
                  <p className="small muted">
                    Preview details: price{p.kind === "drop" ? ", piece count and size" : ""}, packaging and art credit
                    are to be confirmed.
                  </p>
                )}
              </details>
              <details>
                <summary>What’s in the box</summary>
                <ul>
                  {p.includes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>The art</summary>
                <p>{p.art.story}</p>
                <p className="muted small">{p.art.credit}</p>
              </details>
              <details>
                <summary>Shipping</summary>
                <p>
                  Shipping details are being confirmed. Rates and delivery information are placeholders for this
                  preview.
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>
      {d && d.state !== "live" && (
        <div className="section">
          <Signup source="drop" dropSlug={d.slug} />
        </div>
      )}
      {!visible && !purchase.disabled && (
        <div className="sticky-buy">
          <span>
            {p.name}
            <br />
            {money(p.price_cents)}
          </span>
          <button className="button" onClick={buy}>
            {label}
          </button>
        </div>
      )}
    </>
  );
}
