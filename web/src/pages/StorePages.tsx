import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { ArtImage } from "../components/ArtImage";
import { Failure, Loading, Meta, ProductCard, Signup } from "../components/Shared";
import { dropNumber, releaseTimes, releaseDate } from "../utils";
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
export function Home() {
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  const data = q.data;
  const d = data.featured_drop;
  const live = d?.state === "live";
  const hero = d?.product.image ?? tabletop;
  return (
    <>
      <Meta title="A Piece of Home." />
      <link
        rel="preload"
        as="image"
        imageSrcSet={hero.widths.map((w) => `${hero.base}-${w}.webp ${w}w`).join(", ")}
        imageSizes="100vw"
      />
      <section
        className={`hero ${d ? "map-hero" : "core-hero"}`}
        aria-label={d ? "Guåhan Sunset Map puzzle" : "Puzzles of Guåhan"}
      >
        <ArtImage art={hero} sizes="100vw" priority />
        <div className="hero-caption">
          <p className="label">
            {d ? `DROP ${dropNumber(d.number)} · LIMITED EDITION PUZZLE` : "TÅNO + TÅSI · ISLAND SUPPLY CO."}
          </p>
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
          <p>
            {d
              ? live
                ? `Available now · ${d.quantity} made`
                : `Releases ${releaseTimes(d.release_at).guam}`
              : "Puzzles from the island. For wherever you are."}
          </p>
          <Link className="button" to={d ? (live ? "/drop" : "/drop#notify") : "/shop"}>
            {d ? (live ? "SHOP THE DROP" : "NOTIFY ME") : "SHOP"}
          </Link>
        </div>
        <span className="hero-side label" aria-hidden="true">
          GUÅHAN · MARIANA ISLANDS
        </span>
      </section>
      <section className="section collection">
        <div className="section-heading">
          <h2 className="label">CORE COLLECTION</h2>
          <Link className="text-link label" to="/shop">
            SHOP ALL →
          </Link>
        </div>
        <div className="product-grid">
          {data.core_products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
      <section className="section story-strip">
        <p className="label">TÅNO — LAND. TÅSI — SEA.</p>
        <p>{story}</p>
        <Link className="text-link label" to="/story">
          OUR STORY →
        </Link>
      </section>
      <div className="section">
        <Signup />
      </div>
    </>
  );
}
export function Shop() {
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
  const d = q.data.featured_drop;
  return (
    <div className="page">
      <Meta title="Shop" />
      <div className="page-heading">
        <h1>
          SHOP <sup>{String(q.data.core_products.length).padStart(2, "0")}</sup>
        </h1>
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
            <span className="text-link label">SHOP THE DROP →</span>
          </div>
        </Link>
      )}
      <div className="product-grid">
        {q.data.core_products.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}
export function Archive() {
  const q = useQuery({ queryKey: ["drops"], queryFn: api.drops });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => void q.refetch()} />;
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
                  <ArtImage art={d.product.image} />
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
      ) : (
        <div className="archive-empty">
          <span className="label muted">THE BEGINNING</span>
          <h2>The first drop releases Dec 5.</h2>
          <Link className="text-link" to="/drop">
            Meet Drop 001 →
          </Link>
        </div>
      )}
    </div>
  );
}
export function Story() {
  return (
    <div className="page story-page">
      <Meta title="Our Story" />
      <div className="story-intro">
        <img src="/images/brand/logo-mark-800.png" width="280" height="224" alt="Tåno Tåsi — land and sea" />
        <div>
          <p className="label">OUR STORY</p>
          <h1>A piece of home.</h1>
          <p className="story-lead">{story}</p>
        </div>
      </div>
      <div className="story-chapter">
        <div>
          <h2>Tåno. Tåsi.</h2>
          <p>Land and sea. The two things that define our islands, and the connection that stays with us.</p>
          <p>We start with puzzles of Guåhan. Familiar places to spend time with, share, and piece together.</p>
          <p className="muted small">Founded by Christian Tenorio. Founder story to be approved.</p>
        </div>
        <ArtImage art={tabletop} sizes="(min-width: 900px) 55vw, 100vw" />
      </div>
      <Link to="/shop" className="text-link label">
        EXPLORE THE COLLECTION →
      </Link>
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
  const content: Record<string, [string, string]> = {
    shipping: [
      "Shipping & Returns",
      "Shipping rates, delivery areas, and the returns policy are being confirmed. These details are placeholders for this preview.",
    ],
    faq: ["FAQ", "Product and ordering information will be published here before launch."],
    contact: ["Contact", "Contact details are being confirmed. Please check back before launch."],
  };
  const c = content[topic ?? ""];
  return c ? (
    <div className="page narrow empty-page">
      <Meta title={c[0]} />
      <h1>{c[0]}</h1>
      <p>{c[1]}</p>
      <Link className="text-link" to="/shop">
        Back to the collection →
      </Link>
    </div>
  ) : (
    <NotFound />
  );
}
