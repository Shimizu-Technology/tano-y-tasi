import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { villages } from "../components/village/villages";

const featured = ["yigo", "hagatna", "malesso"].map((slug) => villages.find((village) => village.slug === slug)!);

// Only rendered when the featured drop is the map, so the link always reaches the finder.
export function VillageTeaser({ to }: { to: string }) {
  return <section className="village-teaser look-section" aria-labelledby="village-teaser-heading">
    <div className="village-teaser-copy">
      <h2 id="village-teaser-heading">Find your village</h2>
      <p>Every village on Guåhan is on the map.</p>
      <Link className="text-link label" to={to}>Find yours <ArrowRight aria-hidden="true" /></Link>
    </div>
    <div className="village-teaser-crops">
      {featured.map((village) => <figure key={village.slug}>
        <img src={`${village.cropBase}-800.webp`} width="800" height="600" loading="lazy" decoding="async" alt={`${village.name} on the illustrated Guåhan map`} />
        <figcaption>{village.name}</figcaption>
      </figure>)}
    </div>
  </section>;
}
