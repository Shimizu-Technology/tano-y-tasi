import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { ArtImage } from "../components/ArtImage";
import { Meta, Signup } from "../components/Shared";
import { ProductCollection } from "../components/ProductCollection";
import { dropNumber, heroReleaseTime, money } from "../utils";
import type { Art, Storefront } from "../types";
import type { Look } from "./look";

const tabletop: Art = { base: "/images/products/hafa-adai-from-tumon-bay/finished-tabletop", widths: [640, 1280, 2000], aspect: "3:4", role: "lifestyle", alt: "Finished Tumon Bay puzzle on a table with flowers and its keepsake box." };
const detail: Art = { base: "/images/products/guahan-sunset-map/detail-koko", widths: [640, 1280, 2000], aspect: "4:3", role: "detail", alt: "A ko'ko' bird illustrated among the places on the Guåhan map." };

export function SunHillMark() {
  return <svg className="sun-hill-mark" viewBox="0 0 80 40" aria-hidden="true"><circle cx="65" cy="12" r="9" className="mark-sun" /><path d="M3 36C15 31 22 29 29 23C36 17 41 17 49 24C57 31 68 32 77 36C59 34 27 34 3 36Z" className="mark-hill" /></svg>;
}
const missions = ["A piece of home.", "Keeping us connected to where we come from.", "Carrying a piece of home wherever we are."];
export function MissionBand({ moving = false }: { moving?: boolean }) {
  if (!moving) return <section className="mission-band" aria-label="Our mission"><SunHillMark /><p>{missions[1]}</p></section>;
  return <section className="mission-marquee" aria-label="Our mission" tabIndex={0}>
    <div className="mission-track">
      {[false, true].map((duplicate) => <div className="mission-track-copy" key={String(duplicate)} aria-hidden={duplicate ? true : undefined}>{missions.map((line) => <span key={line}><SunHillMark />{line}</span>)}</div>)}
    </div>
  </section>;
}
function RoundedLogo({ className = "" }: { className?: string }) {
  return <img className={`look-emblem ${className}`} src="/images/brand/logo-preview-1200.webp" width="1200" height="990" alt="Tåno Tåsi, land and sea" />;
}
interface HeroProps {
  art: Art;
  actions: ReactNode;
  release: ReactNode;
  summary?: string;
}
function SupplyHero({ art, actions, release, summary }: HeroProps) {
  return (
    <section className="supply-hero">
      <div className="look-hero-copy">
        <p className="label">TÅNO + TÅSI · ISLAND SUPPLY CO.</p>
        <h1>A piece<br />of home.</h1>
        <p className="look-mission">Keeping us connected to where we come from.</p>
        <p className="look-product-summary">{summary}</p>
        {actions}
        {release}
      </div>
      {/* Matches the edge preload's home sizes so the preloaded candidate is reused. */}
      <ArtImage art={art} priority sizes="(min-width: 900px) 60vw, 100vw" />
    </section>
  );
}
function SunHillHero({ art, actions, coreSummary }: HeroProps & { coreSummary?: string }) {
  return (
    <section className="sunhill-hero">
      <div className="sunhill-art">
        <ArtImage art={art} priority sizes="(min-width: 900px) 52vw, 100vw" />
      </div>
      <div className="sunhill-identity">
        <RoundedLogo />
        <h1>A piece of home.</h1>
        <p className="look-mission">Carrying a piece of home wherever we are.</p>
        <p className="look-product-summary">{coreSummary}</p>
        {actions}
      </div>
    </section>
  );
}
function RefinedHero({ art, actions, release, summary }: HeroProps) {
  return (
    <section className="refined-hero">
      <ArtImage art={art} priority sizes="(min-width: 900px) 60vw, 100vw" />
      <div className="look-hero-copy">
        <RoundedLogo />
        <h1>A piece<br />of home.</h1>
        <p className="look-mission">Keeping us connected to where we come from.</p>
        <p>{summary}</p>
        {release}
        {actions}
      </div>
    </section>
  );
}
export function LookHome({ look, data, story }: { look: Look; data: Storefront; story: string }) {
  const drop = data.featured_drop;
  const live = drop?.state === "live";
  const core = data.core_products.find((product) => product.availability.purchasable);
  const art = look === "2" || !drop ? tabletop : drop.product.image;
  const actions = <div className="look-hero-actions"><Link className="button" to="/shop">SHOP THE COLLECTION <ArrowRight aria-hidden="true" /></Link>{drop && <Link className="text-link label" to={live ? "/drop" : "/drop#notify"}>{live ? "SHOP THE DROP" : "NOTIFY ME"}<ArrowRight aria-hidden="true" /></Link>}</div>;
  const release = drop && <p className="look-release">Drop {dropNumber(drop.number)} · {live ? `Available now · ${drop.quantity} made` : drop.state === "upcoming" ? `Releases ${heroReleaseTime(drop.release_at)}` : drop.state === "sold_out" ? "Sold out" : "Closed"}</p>;
  const heroProps = { art, actions, release, summary: drop?.product.summary ?? core?.summary };
  return <div className={`look-home look-home-${look}`}>
    <Meta title="A Piece of Home." />
    {look === "1" ? <SupplyHero {...heroProps} /> : look === "2" ? <SunHillHero {...heroProps} coreSummary={core?.summary} /> : <RefinedHero {...heroProps} />}
    {look !== "1" && <MissionBand moving={look === "2"} />}
    <section className="look-collection look-section">
      <div className="section-heading"><h2>The core collection</h2><Link className="text-link label" to="/shop">Shop all <ArrowRight aria-hidden="true" /></Link></div>
      <ProductCollection products={data.core_products} />
    </section>
    {look === "2" && drop && <section className="look-drop-feature look-section"><ArtImage art={drop.product.image} sizes="(min-width: 900px) 45vw, 100vw" /><div><p className="label">DROP {dropNumber(drop.number)}</p><h2>{drop.name}</h2><p>{drop.product.summary}</p><p>{money(drop.product.price_cents)}</p>{release}<Link className="button" to="/drop">VIEW THE DROP <ArrowRight aria-hidden="true" /></Link></div></section>}
    <section className="look-story look-section"><ArtImage art={look === "1" ? tabletop : detail} sizes="(min-width: 900px) 45vw, 100vw" /><div><SunHillMark /><h2>Tåno is land.<br />Tåsi is sea.</h2><p>{story}</p><Link className="text-link label" to="/story">Our story <ArrowRight aria-hidden="true" /></Link></div></section>
    <div className="look-signup look-section"><Signup /></div>
  </div>;
}
