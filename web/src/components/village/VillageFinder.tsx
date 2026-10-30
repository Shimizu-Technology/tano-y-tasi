import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { villages, type Village } from "./villages";
import "./VillageFinder.css";

const artwork = "/images/products/guahan-sunset-map/artwork";
const imageSizes = "(min-width: 900px) 800px, calc(100vw - 32px)";

function preload(village?: Village) {
  if (!village) return;
  const image = new Image();
  image.srcset = `${village.cropBase}-800.webp 800w, ${village.cropBase}-1600.webp 1600w`;
  image.sizes = imageSizes;
  image.src = `${village.cropBase}-800.webp`;
}

// "hero" puts the interactive map first and loads it eagerly (Look 5's home hero).
export function VillageFinder({ variant = "page" }: { variant?: "page" | "hero" }) {
  const id = useId();
  const [slug, setSlug] = useState("");
  const selected = villages.find((village) => village.slug === slug);
  const select = useRef<HTMLSelectElement>(null);
  const caption = selected ? `${selected.name} on the Guåhan map.` : "The whole island of Guåhan.";

  return (
    <section id="find-your-village" className={`village-finder${variant === "hero" ? " village-finder-hero" : ""}`} aria-labelledby={`${id}-heading`}>
      <div className="village-finder-intro">
        <h2 id={`${id}-heading`}>Find your village</h2>
        <p>Every village on Guåhan is on this map.</p>
        <div className="village-finder-field">
          <label htmlFor={`${id}-select`}>Choose a village</label>
          <select
            ref={select}
            id={`${id}-select`}
            value={slug}
            onFocus={() => preload(selected)}
            onInput={(event) => preload(villages.find((village) => village.slug === event.currentTarget.value))}
            onChange={(event) => {
              preload(villages.find((village) => village.slug === event.target.value));
              setSlug(event.target.value);
            }}
          >
            <option value="">Whole island</option>
            {villages.map((village) => (
              <option key={village.slug} value={village.slug}>{village.name}{village.alternate ? ` (${village.alternate})` : ""}</option>
            ))}
          </select>
        </div>
      </div>
      <figure className="village-finder-figure">
        <VillageMap key={slug} village={selected} priority={variant === "hero"} onRetry={() => select.current?.focus()} />
        <figcaption className="village-finder-caption">
          <span>{caption}</span>
          <button
            className="village-finder-reset"
            disabled={!selected}
            onClick={() => {
              setSlug("");
              select.current?.focus();
            }}
          >Whole island</button>
        </figcaption>
      </figure>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{caption}</p>
    </section>
  );
}

function VillageMap({ village, priority = false, onRetry }: { village?: Village; priority?: boolean; onRetry?: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!village) return;
    // Two frames preserve the whole-island start even when a crop is cached.
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setZoomed(true));
    });
    const timer = window.setTimeout(() => setSettled(true), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [village]);

  const style: CSSProperties = village ? {
    transformOrigin: `${village.x * 100}% ${village.y * 100}%`,
    transform: zoomed ? `translate(${(0.5 - village.x) * 100}%, ${(0.5 - village.y) * 100}%) scale(${24375 / (village.cropWidth * 0.75)})` : "none",
  } : {};
  const crisp = loaded && settled;
  return (
    <div className="village-finder-viewport" data-village={village?.slug ?? "whole"} data-ready={crisp}>
      <img
        className="village-finder-map"
        src={`${artwork}-1280.webp`}
        // Descriptors are the files' real widths (the names are their heights).
        srcSet={`${artwork}-640.webp 509w, ${artwork}-1280.webp 1017w, ${artwork}-2000.webp 1590w`}
        sizes="(min-width: 900px) 480px, 60vw"
        width="509" height="640" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"}
        style={style}
        alt={village ? "" : "The whole island on the illustrated Guåhan map"}
        aria-hidden={!!village}
      />
      {village && (
        <img
          key={attempt}
          className="village-finder-crop"
          src={`${village.cropBase}-800.webp`}
          srcSet={`${village.cropBase}-800.webp 800w, ${village.cropBase}-1600.webp 1600w`}
          sizes={imageSizes}
          width="1600" height="1200" decoding="async"
          alt={`${village.name} on the illustrated Guåhan map`}
          style={{ opacity: crisp ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {failed && (
        <div className="village-finder-error" role="status">
          <span>The detailed image couldn’t load.</span>
          <button className="village-finder-reset" onClick={() => { setFailed(false); setLoaded(false); setAttempt(attempt + 1); onRetry?.(); }}>Try again</button>
        </div>
      )}
    </div>
  );
}
