import { Link } from "react-router";
import type { Product } from "../types";
import { money } from "../utils";
import { ArtImage } from "./ArtImage";
import { ProductCard } from "./Shared";

export function ProductCollection({ products }: { products: Product[] }) {
  if (products.length === 1) return <FeaturedProduct product={products[0]} />;
  return (
    <div className={`product-grid core-collection ${products.length === 2 ? "collection-pair" : "collection-grid"}`}>
      {products.map((product) => <ProductCard key={product.slug} product={product} />)}
    </div>
  );
}

function FeaturedProduct({ product }: { product: Product }) {
  const specs = product.specs;
  return (
    <article className="collection-feature core-collection">
      <Link className="feature-art tile" to={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
        <ArtImage art={product.image} sizes="(min-width: 900px) 58vw, calc(100vw - 32px)" />
      </Link>
      <div className="feature-info">
        <p className="label muted">{product.availability.state === "sold_out" ? "SOLD OUT · CORE COLLECTION" : "CORE COLLECTION"}</p>
        <h2>{product.name}</h2>
        <p className="price">{money(product.price_cents)}</p>
        <p className="feature-summary">{product.summary}</p>
        {specs && <p className="small muted">{specs.piece_count} pieces · {specs.finished_size} finished</p>}
        <Link className="button" to={`/products/${product.slug}`}>VIEW PUZZLE</Link>
      </div>
    </article>
  );
}
