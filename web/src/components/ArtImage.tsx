import { useState } from "react";
import type { Art } from "../types";
export function ArtImage({
  art,
  sizes = "(min-width: 900px) 33vw, 50vw",
  priority = false,
  className = "",
}: {
  art: Art;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [w, h] = art.aspect.split(":").map(Number);
  return (
    <img
      className={`art-image ${loaded ? "loaded" : ""} ${className}`}
      src={`${art.base}-${art.widths[0]}.webp`}
      srcSet={art.widths.map((w) => `${art.base}-${w}.webp ${w}w`).join(", ")}
      sizes={sizes}
      width={w}
      height={h}
      alt={art.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={() => setLoaded(true)}
    />
  );
}
