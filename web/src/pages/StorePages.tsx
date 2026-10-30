import { useLook } from "../looks/look";
import { LookHome } from "../looks/LookHome";
import { useEffect, useState, useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { ArtImage } from "../components/ArtImage";
import { ProductArt } from "../components/ProductArt";
import { Failure, Loading, Meta, Signup } from "../components/Shared";
import { dropNumber, releaseTimes, releaseDate, money, heroReleaseTime } from "../utils";
import { ProductCollection } from "../components/ProductCollection";
import type { Art } from "../types";
export const story =
  "Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are.";
const tabletop: Art = {
  base: "/images/products/hafa-adai-from-tumon-bay/finished-tabletop",
  widths: [640, 1280, 2000],
  aspect: "3:4",
  role: "lifestyle",
  alt: "Finished Tumon Bay puzzle on a table, with flowers and its keepsake box.",
};
const flatPuzzle: Art = {
  base: "/images/products/hafa-adai-from-tumon-bay/finished-flat",
  widths: [640, 1280, 2000],
  aspect: "12:7",
  role: "hero",
  alt: "Finished puzzle of the colorful GUAM sign at Tumon Bay, with blue water and open sky.",
};
const mapDetails: Art[] = [
  { base: "detail-koko", alt: "A ko'ko' bird among the small illustrations on the Guåhan map." },
  { base: "detail-two-lovers-point", alt: "Map detail showing Two Lovers Point on Guåhan's northern coast." },
  { base: "detail-humatak", alt: "Illustrated map detail of Humåtak and its bay." },
].map((art) => ({ ...art, base: `/images/products/guahan-sunset-map/${art.base}`, widths: [640, 1280, 2000], aspect: "4:3", role: "detail" }));

function MapDetails() {
  return (
    <div className="map-details">
      {mapDetails.map((art) => <ArtImage key={art.base} art={art} sizes="(min-width: 900px) 28vw, 100vw" />)}
    </div>
  );
}
function HeroCaption({ children }: { children: ReactNode }) {
  const [enter, setEnter] = useState(() => sessionStorage.getItem("tyt-hero-seen") !== "true");
  useEffect(() => {
    sessionStorage.setItem("tyt-hero-seen", "true");
    if (!enter) return;
    // Drop the marker once the ~300 ms entrance has played, so content that arrives
    // later (a fresh response replacing the edge snapshot) appears without animating.
    const timer = setTimeout(() => setEnter(false), 400);
    return () => clearTimeout(timer);
  }, [enter]);
  const caption = useRef<HTMLDivElement>(null);
  // Only children present on the first commit take part in the entrance; anything a
  // refetch inserts afterwards (even within the 400 ms window) appears without animating.
  useLayoutEffect(() => {
    if (!enter) return;
    for (const child of caption.current?.children ?? []) child.setAttribute("data-enter-item", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={caption} className="hero-caption" data-enter={enter ? "once" : undefined}>{children}</div>;
}
export function Home() {
  const look = useLook();
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  if (q.isPending) return <Loading layout="home" />;
  // A failed background refresh keeps showing the data already on screen.
  if (!q.data) return <Failure error={q.error ?? new Error("Unavailable")} retry={() => void q.refetch()} />;
  const data = q.data;
  if (look) return <LookHome look={look} data={data} story={story} />;
  const d = data.featured_drop;
  const live = d?.state === "live";
  const core = data.core_products.find((product) => product.availability.purchasable);
  const hero = d?.product.image ?? tabletop;
  return (
    <>
      <Meta title="A Piece of Home." />
      <link
        rel="preload"
        as="image"
        imageSrcSet={hero.widths.map((w) => `${hero.base}-${w}.webp ${w}w`).join(", ")}
        imageSizes="(min-width: 900px) 60vw, 100vw"
      />
      <section
        className={`hero ${d ? "map-hero" : "core-hero"}`}
        aria-label={d ? "Guåhan Sunset Map puzzle" : "Puzzles of Guåhan"}
      >
        <ArtImage art={hero} sizes="(min-width: 900px) 60vw, 100vw" priority />
        <HeroCaption>
          <h1>
            {d ? (
              "GUÅHAN"
            ) : (
              <>
                A PIECE
                <br />
                OF HOME.
              </>
            )}
          </h1>
          <p className="hero-summary">{d?.product.summary ?? core?.summary ?? "Puzzles from the island. For wherever you are."}</p>
          {d && (
            <p className="hero-release">
              Drop {dropNumber(d.number)} · {live ? `Available now · ${d.quantity} made` : `Releases ${heroReleaseTime(d.release_at)}`}
            </p>
          )}
          <Link className="button" to={d ? (live ? "/drop" : "/drop#notify") : "/shop"}>
            {d ? (live ? "SHOP THE DROP" : "NOTIFY ME") : "SHOP"}
          </Link>
          {core && (
            <Link className="text-link hero-core-link" to={`/products/${core.slug}`}>
              <span>Shop {core.name} — {money(core.price_cents)}</span><ArrowRight aria-hidden="true" />
            </Link>
          )}
        </HeroCaption>
      </section>
      <section className="section collection">
        <div className="section-heading">
          <h2>The core collection</h2>
          <Link className="text-link label" to="/shop">
            Shop all <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ProductCollection products={data.core_products} />
      </section>
      <section className="section story-strip">
        <div className="story-strip-copy">
          <h2>Tåno is land. Tåsi is sea.</h2>
          <p>{story}</p>
          <Link className="text-link label" to="/story">
            Our story <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <MapDetails />
      </section>
      <div className="section">
        <Signup />
      </div>
    </>
  );
}
export function Shop() {
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  if (q.isPending) return <Loading layout="collection" />;
  // A failed background refresh keeps showing the data already on screen.
  if (!q.data) return <Failure error={q.error ?? new Error("Unavailable")} retry={() => void q.refetch()} />;
  const d = q.data.featured_drop;
  return (
    <div className="page">
      <Meta title="Shop" />
      <div className="page-heading">
        <div className="shop-title">
          <h1>Shop</h1>
          <span className="muted">{q.data.core_products.length} {q.data.core_products.length === 1 ? "puzzle" : "puzzles"}</span>
        </div>
        <p className="muted">The core collection. Made to come back to.</p>
      </div>
      {d?.state === "live" && (
        <Link className="wide-drop" to="/drop">
          <ArtImage art={d.product.image} sizes="(min-width: 900px) 320px, 40vw" />
          <div>
            <p className="label">
              <span className="live-dot" /> DROP {dropNumber(d.number)} · AVAILABLE NOW
            </p>
            <h2>{d.name}</h2>
            <p>{d.quantity} made. One time only.</p>
            <span className="text-link label">SHOP THE DROP <ArrowRight aria-hidden="true" /></span>
          </div>
        </Link>
      )}
      <ProductCollection products={q.data.core_products} />
    </div>
  );
}
export function Archive() {
  const q = useQuery({ queryKey: ["drops"], queryFn: api.drops });
  if (q.isPending) return <Loading layout="archive" />;
  // A failed background refresh keeps showing the data already on screen.
  if (!q.data) return <Failure error={q.error ?? new Error("Unavailable")} retry={() => void q.refetch()} />;
  const next = q.data.current ?? q.data.upcoming[0];
  return (
    <div className="page archive">
      <Meta title="Archive" />
      <div className="page-heading">
        <h1>ARCHIVE</h1>
        <p className="muted">One-time releases. A record of what came before.</p>
      </div>
      {q.data.archive.length ? (
        <div className="product-grid">
          {q.data.archive.map((d) => (
            <div key={d.slug}>
              <Link to={`/drops/${d.slug}`} className="archive-card">
                <div className="tile">
                  <ProductArt product={d.product} />
                </div>
                <p>{d.name}</p>
                <p className="label muted">
                  DROP {dropNumber(d.number)} · {releaseDate(d.release_at)} · {d.quantity} MADE
                </p>
                <p className="label">{d.state === "closed" ? "CLOSED" : "SOLD OUT"}</p>
              </Link>
            </div>
          ))}
        </div>
      ) : next ? (
        <article className="archive-preview">
          <Link to={`/drops/${next.slug}`} aria-label={`Explore Drop ${dropNumber(next.number)} — ${next.name}`}>
            <ProductArt product={next.product} sizes="(min-width: 900px) 50vw, 100vw" priority />
          </Link>
          <div>
            <p className="label">Drop {dropNumber(next.number)} · {next.state === "upcoming" ? "Upcoming" : "Available now"}</p>
            <h2>{next.name}</h2>
            <p><time dateTime={next.release_at}>{releaseTimes(next.release_at).guam}</time></p>
            <Link className="text-link label" to={`/drops/${next.slug}`}>
              Meet Drop {dropNumber(next.number)} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>
      ) : <p className="muted">No past drops yet.</p>}
    </div>
  );
}
export function Story() {
  return (
    <div className="page story-page">
      <Meta title="Our Story" />
      <section className="story-intro">
        <div className="story-emblem">
          <img src="/images/brand/logo-mark-800.png" width="280" height="224" alt="Tåno Tåsi — land and sea" />
        </div>
        <div>
          <h1>A piece of home.</h1>
          <p className="story-lead">{story}</p>
        </div>
      </section>
      <section className="story-chapter story-meaning">
        <div className="story-copy">
          <h2>Tåno. Tåsi.</h2>
          <p>Land and sea. The two things that define our islands, and the connection that stays with us.</p>
        </div>
        <MapDetails />
      </section>
      <section className="story-chapter story-puzzles">
        <ArtImage art={flatPuzzle} sizes="(min-width: 900px) 55vw, 100vw" />
        <div className="story-copy">
          <p>We start with puzzles of Guåhan. Familiar places to spend time with, share, and piece together.</p>
          <Link to="/shop" className="text-link label">
            EXPLORE THE COLLECTION <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="page narrow empty-page">
      <Meta title="Page not found" />
      <p className="label">404</p>
      <h1>A little off island.</h1>
      <p>We couldn’t find this page.</p>
      <Link className="button" to="/shop">
        BACK TO SHOP
      </Link>
    </div>
  );
}
export function Info() {
  const { topic } = useParams();
  return topic === "faq" ? <FAQ /> : topic === "shipping" || topic === "contact" ? (
    <div className="page narrow info-page">
      <Meta title={topic === "shipping" ? "Shipping" : "Contact"} />
      <h1>{topic === "shipping" ? "Shipping" : "Contact"}</h1>
      <p>{topic === "shipping"
        ? "Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico."
        : "Contact details are not available yet."}</p>
      <Link className="text-link" to="/shop">Back to the collection <ArrowRight aria-hidden="true" /></Link>
    </div>
  ) : <NotFound />;
}
function FAQ() {
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  const drop = q.data?.featured_drop;
  const times = drop ? releaseTimes(drop.release_at) : null;
  return (
    <div className="page narrow info-page">
      <Meta title="FAQ" />
      <h1>FAQ</h1>
      <div className="faq-answers">
        <section>
          <h2>When does the next drop release?</h2>
          {times ? <p>Drop {dropNumber(drop!.number)} {drop!.state === "upcoming" ? "releases" : "released"} {times.guam} · {times.pacific} · {times.hawaii}.</p>
            : q.isPending ? <p role="status">Loading release details…</p>
              : q.isError ? <p>Release details are unavailable. <button className="inline-link" onClick={() => void q.refetch()}>Try again</button></p>
                : <p>The next release has not been announced.</p>}
        </section>
        {drop && <section><h2>How many can I buy?</h2><p>Drop {dropNumber(drop.number)} is limited to {drop.per_customer_limit} per customer.</p></section>}
        <section><h2>Do drops restock?</h2><p>No. Drops are one-time releases and never restock.</p></section>
        <section><h2>Where do you ship?</h2><p>We ship to the United States, Guam and Puerto Rico. Shipping is calculated at checkout.</p></section>
        <section><h2>How long is my checkout held?</h2><p>Your puzzles are held for about 30 minutes at checkout.</p></section>
      </div>
      <Link className="text-link" to="/shop">Back to the collection <ArrowRight aria-hidden="true" /></Link>
    </div>
  );
}
