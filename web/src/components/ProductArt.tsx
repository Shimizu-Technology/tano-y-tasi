import { useEffect, useRef, useState } from "react";
import { useLook } from "../looks/look";
import type { Product } from "../types";
import { ArtImage } from "./ArtImage";

// Keep every other look's image markup, loading and layout unchanged.
export function ProductArt({ product, sizes, priority = false }: { product: Product; sizes?: string; priority?: boolean }) {
  const look = useLook();
  return look === "5" && product.alt_image
    ? <SecondView key={`${product.slug}-${product.alt_image.base}`} product={product} sizes={sizes} priority={priority} />
    : <ArtImage art={product.image} sizes={sizes} priority={priority} />;
}

function SecondView({ product, sizes = "(min-width: 900px) 33vw, 50vw", priority = false }: { product: Product; sizes?: string; priority?: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const alt = product.alt_image!;
  useEffect(() => {
    const link = root.current?.closest("a");
    if (!link) return;
    const request = () => {
      if (matchMedia("(hover: hover) and (pointer: fine)").matches) setRequested(true);
    };
    link.addEventListener("pointerenter", request);
    link.addEventListener("focus", request);
    return () => {
      link.removeEventListener("pointerenter", request);
      link.removeEventListener("focus", request);
    };
  }, []);
  return <span ref={root} className="product-second-view" data-ready={ready || undefined}>
    <ArtImage art={product.image} sizes={sizes} className="second-view-main" priority={priority} />
    {requested && <img
      className="second-view-alt"
      src={`${alt.base}-${alt.widths[0]}.webp`}
      srcSet={alt.widths.map((width) => `${alt.base}-${width}.webp ${width}w`).join(", ")}
      sizes={sizes}
      width={Number(alt.aspect.split(":")[0])} height={Number(alt.aspect.split(":")[1])}
      alt="" aria-hidden="true" decoding="async" fetchPriority="low"
      onLoad={() => setReady(true)} onError={() => setReady(false)}
    />}
  </span>;
}
