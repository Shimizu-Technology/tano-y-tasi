import { ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { villages } from "../components/village/villages";
import { useReducedMotion } from "../useReducedMotion";
import { PUZZLE_ART } from "./art";
import { pieceAt } from "./geometry";
import { MAP_CUT, MAP_PLAN } from "./mapPuzzle";
import { canDraw, drawFrame, fitLayout, makeSprites, outlinePath, poseAt, whenLoaded, type Layout, type Pose, type Sprite } from "./render";
import { easeInOut, easeOut } from "./timeline";
import "../components/village/VillageFinder.css";

const LIFT_MS = 300;
const HOLD_MS = 220;
const SETTLE_MS = 380;

// A chosen piece rises out of the finished map, turns a little, and settles back into its place.
function lifted(base: Pose, elapsed: number): Pose {
  const up = elapsed < LIFT_MS ? easeOut(elapsed / LIFT_MS) : elapsed < LIFT_MS + HOLD_MS ? 1 : 1 - easeInOut(Math.min(1, (elapsed - LIFT_MS - HOLD_MS) / SETTLE_MS));
  return { ...base, y: base.y - 8 * up, turn: -0.1 * up, scale: 1 + 0.2 * up, shadow: 0.55 * up, offset: 14 * up };
}

/** The finished map puzzle. Choosing a village lifts its piece and leaves it outlined. */
export function VillagePiece() {
  const id = useId();
  const reduced = useReducedMotion();
  const [slug, setSlug] = useState("");
  const [drawable] = useState(canDraw);
  const [failed, setFailed] = useState(false);
  const selected = villages.find((village) => village.slug === slug);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const chosen = useRef<{ index: number; since: number } | null>(null);
  const redraw = useRef<() => void>(() => {});
  const caption = selected ? `${selected.name} on the Guåhan map.` : "The whole island of Guåhan.";

  useEffect(() => {
    const [element, picture] = [canvas.current, image.current];
    const context = element?.getContext("2d");
    if (!element || !picture || !context) return;
    let sprites: Sprite[] | null = null;
    let layout: Layout | null = null;
    let dpr = 1;
    let frame = 0;
    let gone = false;

    const draw = (now: number) => {
      frame = 0;
      if (!sprites || !layout) return;
      const poses = MAP_CUT.pieces.map((piece) => ({ ...poseAt(MAP_CUT, MAP_PLAN, layout!, piece.index, 1), shadow: 0 }));
      const pick = chosen.current;
      const order = MAP_CUT.pieces.map((piece) => piece.index).filter((index) => index !== pick?.index);
      drawFrame(context, sprites, poses, order, dpr);
      if (!pick) return;
      const elapsed = reduced ? Infinity : now - pick.since;
      // Everything else steps back a little, so the chosen piece reads at a glance.
      context.fillStyle = "rgba(229, 223, 210, 0.42)";
      context.fillRect(layout.map.x * dpr, layout.map.y * dpr, layout.map.w * dpr, layout.map.h * dpr);
      const pose = Number.isFinite(elapsed) ? lifted(poses[pick.index], elapsed) : poses[pick.index];
      drawFrame(context, sprites, [...poses.slice(0, pick.index), pose, ...poses.slice(pick.index + 1)], [pick.index], dpr, false);
      if (elapsed >= LIFT_MS + HOLD_MS + SETTLE_MS) {
        const unit = (layout.map.w / MAP_CUT.width) * dpr;
        context.setTransform(unit, 0, 0, unit, layout.map.x * dpr, layout.map.y * dpr);
        context.lineWidth = (2.5 * dpr) / unit;
        context.strokeStyle = getComputedStyle(element).getPropertyValue("--color-sun").trim() || "#ed601b";
        context.stroke(outlinePath(MAP_CUT.pieces[pick.index]));
        context.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        frame = requestAnimationFrame(draw);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const measure = () => {
      if (gone || !picture.complete || !picture.naturalWidth) return;
      dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      element.width = Math.round(box.width * dpr);
      element.height = Math.round(box.height * dpr);
      layout = fitLayout(MAP_CUT, { x: 0, y: 0, w: box.width, h: box.height });
      sprites = makeSprites(MAP_CUT, picture, (layout.map.w / MAP_CUT.width) * dpr, dpr);
      element.dataset.ready = "";
      schedule();
    };
    redraw.current = schedule;
    const resize = new ResizeObserver(measure);
    whenLoaded(picture).then(() => {
      if (gone) return;
      measure();
      resize.observe(element);
    }, () => {
      if (!gone) setFailed(true);
    });
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      redraw.current = () => {};
    };
  }, [reduced]);

  function choose(next: string) {
    setSlug(next);
    const village = villages.find((v) => v.slug === next);
    chosen.current = village ? { index: pieceAt(MAP_CUT, village.x, village.y).index, since: performance.now() } : null;
    redraw.current();
  }

  return (
    <section className="home-section village-piece" aria-labelledby={`${id}-heading`} data-village={selected?.slug ?? "whole"}>
      <div className="village-piece-intro">
        <h2 id={`${id}-heading`}>Find your village</h2>
        <p>Every village on Guåhan is on this map.</p>
        <div className="village-finder-field">
          <label htmlFor={`${id}-select`}>Choose a village</label>
          <select id={`${id}-select`} value={slug} onChange={(event) => choose(event.target.value)}>
            <option value="">Whole island</option>
            {villages.map((village) => (
              <option key={village.slug} value={village.slug}>{village.name}{village.alternate ? ` (${village.alternate})` : ""}</option>
            ))}
          </select>
        </div>
        <Link className="text-link label" to="/products/guahan-sunset-map">VIEW THE MAP <ArrowRight aria-hidden="true" /></Link>
      </div>
      <figure className="village-piece-figure">
        <div className="village-piece-board">
          <img
            ref={image}
            className="village-piece-art"
            src={PUZZLE_ART.src}
            srcSet={PUZZLE_ART.srcSet}
            sizes="(min-width: 900px) 480px, calc(100vw - 32px)"
            width={PUZZLE_ART.width}
            height={PUZZLE_ART.height}
            alt={PUZZLE_ART.alt}
            loading="lazy"
            onError={() => setFailed(true)}
          />
          {drawable && !failed && <canvas ref={canvas} className="village-piece-canvas" aria-hidden="true" />}
        </div>
        <figcaption className="village-finder-caption"><span>{caption}</span></figcaption>
      </figure>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{caption}</p>
    </section>
  );
}
