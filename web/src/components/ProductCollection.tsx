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
        {product.availability.state === "sold_out" && <p className="label muted">SOLD OUT</p>}
        {specLine(specs) && <p className="small muted">{specLine(specs)}</p>}
        <h2>{product.name}</h2>
        <p className="price">{money(product.price_cents)}</p>
        <p className="feature-summary">{product.summary}</p>
        <Link className="button" to={`/products/${product.slug}`}>VIEW PUZZLE</Link>
      </div>
    </article>
  );
}

function specLine(specs: Product["specs"] | undefined) {
  const parts = [
    specs?.piece_count != null ? `${specs.piece_count} pieces` : null,
    specs?.finished_size ? `${specs.finished_size} finished` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
