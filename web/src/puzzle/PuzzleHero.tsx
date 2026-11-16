import { ArrowDown, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Emblem } from "../components/Emblem";
import { NotifyDialog } from "../components/NotifyDialog";
import { dropStatus } from "../pages/Home";
import { useReducedMotion } from "../useReducedMotion";
import { useStoreSettings } from "../useStore";
import { dropItems, dropNumber } from "../utils";
import type { Product, Storefront } from "../types";
import { PUZZLE_ART } from "./art";
import { MAP_CUT, MAP_PLAN } from "./mapPuzzle";
import { canDraw, context2d, drawFrame, fitLayout, layers, makeSprites, poseAt, stillLayer, watchPixelRatio, whenLoaded, type Layout, type Sprite } from "./render";
import { chapterAt, clamp01 } from "./timeline";
import "./puzzle.css";

type Drop = NonNullable<Storefront["featured_drop"]>;
const MAP_SLUG = "guahan-sunset-map";
// A short landscape phone has no room to pin the puzzle; it gets the finished map instead.
const roomy = "(min-height: 560px)";
const subscribeRoomy = (onChange: () => void) => {
  const media = window.matchMedia?.(roomy);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
};
const useRoomy = () => useSyncExternalStore(subscribeRoomy, () => window.matchMedia?.(roomy).matches ?? true, () => true);
// Device pixels are capped: sharper than this costs memory without a visible gain.
const pixelRatio = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
// Wheel steps jump; the drawn progress follows the scroll with this time constant.
const FOLLOW_MS = 80;

type Ref<T> = React.RefObject<T | null>;
/**
 * Draws the map puzzle as the page scrolls through `section`, and says which chapter of the words
 * goes with it. `failed` turns true if the picture doesn't load. The pile, the placed pieces and the
 * pieces in the air are three stacked canvases; the first two are redrawn only when a piece moves
 * between them, so a frame stamps just the few pieces in the air.
 */
function useAssembly(live: boolean, sectionRef: Ref<HTMLElement>, stickyRef: Ref<HTMLDivElement>, stageRef: Ref<HTMLDivElement>, layersRef: Ref<HTMLDivElement>, imageRef: Ref<HTMLImageElement>) {
  const [chapter, setChapter] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const [section, sticky, stage, host, image] = [sectionRef.current, stickyRef.current, stageRef.current, layersRef.current, imageRef.current];
    if (!live || !section || !sticky || !stage || !host || !image) return;
    const canvases = ["pile", "placed", "moving"].map(() => host.appendChild(document.createElement("canvas")));
    // Contexts come once the picture has loaded, so a canvas the browser can't back falls to the
    // finished map along with a picture that fails.
    let pileLayer: ReturnType<typeof stillLayer>;
    let placedLayer: ReturnType<typeof stillLayer>;
    let movingLayer: CanvasRenderingContext2D;
    let sprites: Sprite[] | null = null;
    let layout: Layout | null = null;
    let dpr = pixelRatio();
    let target = 0;
    let shown = 0;
    let frame = 0;
    let last = 0;
    let current = -1;
    let gone = false;
    let placedCount = -1;
    let airborne = false;
    // How far the page scrolls while the puzzle is pinned, and where it is pinned. Kept from the last measure.
    let travel = 0;
    let pinnedAt = 0;

    const progress = () => (travel > 0 ? clamp01((pinnedAt - section.getBoundingClientRect().top) / travel) : 1);
    const draw = () => {
      if (!sprites || !layout) return;
      const poses = MAP_CUT.pieces.map((piece) => poseAt(MAP_CUT, MAP_PLAN, layout!, piece.index, shown));
      const { pile, placed, moving } = layers(MAP_PLAN, poses);
      pileLayer.update(sprites, poses, pile, dpr);
      placedLayer.update(sprites, poses, placed, dpr);
      // An empty sky needs clearing once, not every frame.
      if (moving.length || airborne) drawFrame(movingLayer, sprites, poses, moving, dpr);
      airborne = moving.length > 0;
      if (placed.length !== placedCount) {
        placedCount = placed.length;
        section.dataset.placed = String(placedCount);
      }
      const next = chapterAt(shown);
      if (next !== current) {
        current = next;
        setChapter(next);
      }
    };
    const tick = (now: number) => {
      const step = 1 - Math.exp(-(now - last) / FOLLOW_MS);
      last = now;
      shown += (target - shown) * step;
      if (Math.abs(target - shown) < 0.0005) shown = target;
      draw();
      frame = shown === target ? 0 : requestAnimationFrame(tick);
    };
    const follow = () => {
      target = progress();
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const measure = () => {
      if (gone || !image.complete || !image.naturalWidth) return;
      dpr = pixelRatio();
      travel = section.offsetHeight - sticky.offsetHeight;
      pinnedAt = parseFloat(getComputedStyle(sticky).top) || 0;
      const bounds = sticky.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      for (const canvas of canvases) {
        canvas.width = Math.round(bounds.width * dpr);
        canvas.height = Math.round(bounds.height * dpr);
      }
      layout = fitLayout(MAP_CUT, { x: box.left - bounds.left, y: box.top - bounds.top, w: box.width, h: box.height });
      sprites = makeSprites(MAP_CUT, image, (layout.map.w / MAP_CUT.width) * dpr, dpr);
      pileLayer.reset();
      placedLayer.reset();
      airborne = true;
      target = shown = progress();
      draw();
      host.dataset.ready = "";
    };

    let unwatch = () => {};
    const stop = () => {
      gone = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      unwatch();
      window.removeEventListener("scroll", follow);
      canvases.forEach((canvas) => canvas.remove());
      delete host.dataset.ready;
    };
    // Anything that can't draw, now or on a later resize, gives way to the finished map.
    const fail = () => {
      if (gone) return;
      stop();
      setFailed(true);
    };
    const remeasure = () => {
      try {
        measure();
      } catch {
        fail();
      }
    };
    const resize = new ResizeObserver(remeasure);
    whenLoaded(image).then(() => {
      if (gone) return;
      const [pile, placed, moving] = canvases.map(context2d);
      [pileLayer, placedLayer, movingLayer] = [stillLayer(pile), stillLayer(placed), moving];
      measure();
      resize.observe(sticky);
      resize.observe(stage);
      unwatch = watchPixelRatio(remeasure);
      window.addEventListener("scroll", follow, { passive: true });
    }).catch(fail);
    return stop;
  }, [live, sectionRef, stickyRef, stageRef, layersRef, imageRef]);
  return { chapter, failed };
}

// The map's product, from the drop or the core collection, for the last chapter.
function findMap(drop: Drop | null, core: Product[]) {
  const inDrop = drop ? dropItems(drop).find((product) => product.slug === MAP_SLUG) : undefined;
  return { product: inDrop ?? core.find((product) => product.slug === MAP_SLUG), drop: inDrop ? drop : null };
}

/**
 * The puzzle home's first screen: the map's pieces lie spread out, and scrolling puts them together,
 * land first, then sea, then Hagåtña's piece last. With reduced motion, on a short screen, or if the
 * canvas can't draw, it is the finished map.
 */
export function PuzzleHero({ drop, core }: { drop: Drop | null; core: Product[] }) {
  const brand = useStoreSettings();
  const reduced = useReducedMotion();
  const tall = useRoomy();
  const [notify, setNotify] = useState(false);
  const section = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [drawable] = useState(canDraw);
  const [broken, setBroken] = useState(false);
  const wanted = drawable && !reduced && tall && !broken;
  const { chapter, failed } = useAssembly(wanted, section, sticky, stage, layersRef, image);
  const live = wanted && !failed;
  const map = findMap(drop, core);
  const chapters = [
    <>
      <h1 id="home-title">{brand.tagline}</h1>
      <p className="home-mission">{brand.mission[0]}</p>
      {live && <p className="puzzle-hint label" aria-hidden="true">Scroll to put Guåhan together <ArrowDown /></p>}
    </>,
    <p className="puzzle-title">{brand.storyHeading[0]}</p>,
    <p className="puzzle-title">{brand.storyHeading[1]}</p>,
    <>
      {brand.secondaryTagline && <p className="puzzle-tagline label">{brand.secondaryTagline}</p>}
      <p className="puzzle-title">{map.product?.name ?? brand.tagline}</p>
      <p className="puzzle-status">
        {map.drop ? `Drop ${dropNumber(map.drop.number)} · ${dropStatus(map.drop)}` : map.product?.summary ?? brand.mission[1]}
      </p>
    </>,
  ];

  return (
    <section ref={section} className="puzzle-hero" data-mode={live ? "live" : "still"} data-pieces={MAP_CUT.pieces.length} aria-labelledby="home-title">
      <div ref={sticky} className="puzzle-sticky">
        {live && <div ref={layersRef} className="puzzle-canvas" aria-hidden="true" />}
        <div className="puzzle-copy">
          {/* Desktop only, and it stays while the words change. Lazy, so a phone that hides it never loads it. */}
          <Emblem className="puzzle-emblem" sizes="(min-width: 900px) 220px, 1px" width={360} />
          {/* The later chapters restate the story and the drop, which follow in full further down the
              page, so assistive technology reads the first chapter only. */}
          <div className="puzzle-chapters">
            {(live ? chapters : chapters.slice(0, 1)).map((content, index) => (
              <div key={index} className="puzzle-chapter" data-active={index === (live ? chapter : 0) || undefined} aria-hidden={index > 0 || undefined}>{content}</div>
            ))}
          </div>
        </div>
        <div ref={stage} className="puzzle-stage">
          {/* The finished map: what the canvas draws from, and what shows when it can't. */}
          <img
            ref={image}
            className="puzzle-art"
            src={PUZZLE_ART.src}
            srcSet={PUZZLE_ART.srcSet}
            sizes={PUZZLE_ART.sizes}
            width={PUZZLE_ART.width}
            height={PUZZLE_ART.height}
            alt={PUZZLE_ART.alt}
            fetchPriority="high"
            onError={() => setBroken(true)}
          />
        </div>
        <div className="puzzle-actions home-actions">
          <Link className="button" to="/shop">SHOP THE COLLECTION <ArrowRight aria-hidden="true" /></Link>
          {drop?.state === "live" && <Link className="text-link label" to="/drop">SHOP THE DROP<ArrowRight aria-hidden="true" /></Link>}
          {drop?.state === "upcoming" && <button type="button" className="text-link label" aria-haspopup="dialog" onClick={() => setNotify(true)}>NOTIFY ME<ArrowRight aria-hidden="true" /></button>}
        </div>
      </div>
      {notify && drop && <NotifyDialog name={drop.name} source="home" dropSlug={drop.slug} onClose={() => setNotify(false)} />}
    </section>
  );
}
