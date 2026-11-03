import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useStoreSettings } from "../useStore";
import { HOME_HERO_ART, HOME_HERO_SIZES } from "../homeHero";
import { ArtImage } from "../components/ArtImage";
import { Emblem } from "../components/Emblem";
import { MissionMarquee, SunHillMark } from "../components/MissionMarquee";
import { ProductCollection } from "../components/ProductCollection";
import { Failure, Loading, Meta, Signup } from "../components/Shared";
import { dropNumber, heroReleaseTime, money } from "../utils";
import type { Art, Storefront } from "../types";
import "./home.css";

const kokoDetail: Art = { base: "/images/products/guahan-sunset-map/detail-koko", widths: [640, 1280, 2000], aspect: "4:3", role: "detail", alt: "A ko'ko' bird illustrated among the places on the Guåhan map." };

type Drop = NonNullable<Storefront["featured_drop"]>;
const comingSoon = (drop: Drop) => drop.state === "upcoming" && !drop.release_at;
// Only an announced, upcoming drop gets a date. A drop without one reads "Coming soon", never a placeholder.
function dropStatus(drop: Drop) {
  if (drop.state === "live") return `Available now${drop.quantity != null ? ` · ${drop.quantity} made` : ""}`;
  if (drop.state === "upcoming") return drop.release_at ? `Releases ${heroReleaseTime(drop.release_at)}${drop.quantity != null ? ` · ${drop.quantity} made` : ""}` : "Coming soon";
  return drop.state === "sold_out" ? "Sold out" : "This drop has closed";
}

function Hero({ drop, coreSummary }: { drop: Drop | null; coreSummary?: string }) {
  const brand = useStoreSettings();
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <Emblem className="home-emblem" sizes="(min-width: 900px) 300px, 124px" width={360} priority />
        <h1 id="home-title">{brand.tagline}</h1>
        <p className="home-mission">{brand.mission[0]}</p>
      </div>
      <div className="home-hero-art">
        {/* Same srcset and sizes as the edge preload (netlify/lib/storefront.ts). */}
        <ArtImage art={HOME_HERO_ART} priority sizes={HOME_HERO_SIZES} />
      </div>
      <div className="home-hero-actions">
        {coreSummary && <p className="home-hero-caption">{coreSummary}</p>}
        <div className="home-actions">
          <Link className="button" to="/shop">SHOP THE COLLECTION <ArrowRight aria-hidden="true" /></Link>
          {drop?.state === "live" && <Link className="text-link label" to="/drop">SHOP THE DROP<ArrowRight aria-hidden="true" /></Link>}
          {drop?.state === "upcoming" && <a className="text-link label" href="#notify">NOTIFY ME<ArrowRight aria-hidden="true" /></a>}
        </div>
      </div>
    </section>
  );
}

// The drop on the home page, in every state. Upcoming and coming-soon drops lead with the alert signup.
function DropFeature({ drop }: { drop: Drop }) {
  const soon = comingSoon(drop);
  const upcoming = drop.state === "upcoming";
  return (
    <section className="home-section home-drop" aria-labelledby="home-drop-title" data-drop-state={soon ? "coming_soon" : drop.state}>
      <ArtImage art={drop.product.image} sizes="(min-width: 900px) 45vw, 100vw" />
      <div>
        <p className="label">DROP {dropNumber(drop.number)}{soon && " · COMING SOON"}</p>
        <h2 id="home-drop-title">{drop.name}</h2>
        <p>{drop.product.summary}</p>
        {!soon && <p className="home-drop-price">{money(drop.product.price_cents)}</p>}
        <p className="home-drop-status">
          {soon ? "The release date goes to the list first." : `Drop ${dropNumber(drop.number)} · ${dropStatus(drop)}`}
        </p>
        {upcoming
          ? <Signup inline source="home-drop" dropSlug={drop.slug} cta="NOTIFY ME" />
          : <Link className="button" to="/drop">VIEW THE DROP <ArrowRight aria-hidden="true" /></Link>}
        {upcoming && <Link className="text-link label" to="/drop">VIEW THE DROP <ArrowRight aria-hidden="true" /></Link>}
      </div>
    </section>
  );
}

export function Home() {
  const brand = useStoreSettings();
  const q = useQuery({ queryKey: ["storefront"], queryFn: api.storefront });
  if (q.isPending) return <Loading layout="home" />;
  // A failed background refresh keeps showing the data already on screen.
  if (!q.data) return <Failure error={q.error ?? new Error("Unavailable")} retry={() => void q.refetch()} />;
  const { featured_drop: drop, core_products: products } = q.data;
  const core = products.find((product) => product.availability.purchasable);
  return (
    <div className="home">
      <Meta title="A Piece of Home." />
      <Hero drop={drop} coreSummary={core?.summary} />
      <MissionMarquee />
      <section className="home-section home-collection" aria-labelledby="home-collection-title">
        <div className="section-heading"><h2 id="home-collection-title">The core collection</h2><Link className="text-link label" to="/shop">Shop all <ArrowRight aria-hidden="true" /></Link></div>
        <ProductCollection products={products} />
      </section>
      {drop && <DropFeature drop={drop} />}
      <section className="home-section home-story">
        <ArtImage art={kokoDetail} sizes="(min-width: 900px) 45vw, 100vw" />
        <div>
          <SunHillMark />
          <h2>{brand.storyHeading[0]}<br />{brand.storyHeading[1]}</h2>
          <p>{brand.story}</p>
          <p className="home-secondary-tagline label">{brand.secondaryTagline}</p>
          <Link className="text-link label" to="/story">Our story <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>
      {/* An upcoming drop carries its own alert form above; every other state ends with the general list. */}
      {drop?.state !== "upcoming" && <div className="home-section home-signup"><Signup /></div>}
    </div>
  );
}
