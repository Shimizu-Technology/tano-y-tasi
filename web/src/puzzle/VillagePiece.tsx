import { ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { villages } from "../components/village/villages";
import { useReducedMotion } from "../useReducedMotion";
import { PUZZLE_ART } from "./art";
import { MAP_CUT, MAP_PLAN, VILLAGE_DOTS, villagePieces } from "./mapPuzzle";
import { canDraw, context2d, drawFrame, fitLayout, makeSprites, outlinePath, poseAt, watchPixelRatio, whenLoaded, type Layout, type Pose, type Sprite } from "./render";
import { easeInOut, easeOut } from "./timeline";
import "../components/village/VillageFinder.css";

const LIFT_MS = 300;
const HOLD_MS = 220;
const SETTLE_MS = 380;

// A lifted name is shown about this wide, in CSS pixels, so it reads; never more than this much larger.
const LIFTED_WIDTH = 110;
const MAX_GROW = 2.5;

/**
 * The pieces a village's name is on rise out of the finished map together, as one held section:
 * larger, turned a little, with a shadow, then settle back into place. `scale` is their size at the
 * top of the lift.
 */
function lifted(poses: Pose[], pieces: number[], elapsed: number, scale: number, layout: Layout): Pose[] {
  const up = elapsed < LIFT_MS ? easeOut(elapsed / LIFT_MS) : elapsed < LIFT_MS + HOLD_MS ? 1 : 1 - easeInOut(Math.min(1, (elapsed - LIFT_MS - HOLD_MS) / SETTLE_MS));
  const unit = layout.map.w / MAP_CUT.width;
  const cells = pieces.map((i) => MAP_CUT.pieces[i].cell);
  const [left, top] = [Math.min(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.y))];
  const [right, bottom] = [Math.max(...cells.map((c) => c.x + c.w)), Math.max(...cells.map((c) => c.y + c.h))];
  const [turn, size] = [-0.08 * up, 1 + (scale - 1) * up];
  // The section grows about its middle, moved in from the edges of the map so none of it is cut off.
  const [halfW, halfH] = [((right - left) * unit * size) / 2 + 6, ((bottom - top) * unit * size) / 2 + 6];
  const [mx, my] = [layout.map.x + ((left + right) / 2) * unit, layout.map.y + ((top + bottom) / 2) * unit];
  const fit = (v: number, from: number, to: number) => (to - from < 0 ? (from + to) / 2 : Math.min(to, Math.max(from, v)));
  const cx = mx + (fit(mx, layout.map.x + halfW, layout.map.x + layout.map.w - halfW) - mx) * up;
  const cy = my - 8 * up + (fit(my, layout.map.y + halfH, layout.map.y + layout.map.h - halfH) - my) * up;
  const [cos, sin] = [Math.cos(turn) * size, Math.sin(turn) * size];
  const out = [...poses];
  for (const i of pieces) {
    const [dx, dy] = [poses[i].x - mx, poses[i].y - my];
    out[i] = { ...poses[i], x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos, turn, scale: size, shadow: 0.55 * up, offset: 14 * up };
  }
  return out;
}

/** Splits pieces into sections of pieces that touch side by side, so a name and a dot apart from it lift on their own. */
function sections(pieces: number[]): number[][] {
  const left = new Set(pieces);
  const out: number[][] = [];
  for (const first of pieces) {
    if (!left.delete(first)) continue;
    const section = [first];
    for (let k = 0; k < section.length; k++) {
      const [row, col] = [Math.floor(section[k] / MAP_CUT.cols), section[k] % MAP_CUT.cols];
      for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        const next = r * MAP_CUT.cols + c;
        if (c >= 0 && c < MAP_CUT.cols && left.delete(next)) section.push(next);
      }
    }
    out.push(section);
  }
  return out;
}

/** The finished map puzzle. Choosing a village lifts the pieces its name is on and leaves them outlined. */
export function VillagePiece() {
  const id = useId();
  const reduced = useReducedMotion();
  const [slug, setSlug] = useState("");
  const [drawable] = useState(canDraw);
  const [failed, setFailed] = useState(false);
  const selected = villages.find((village) => village.slug === slug);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const chosen = useRef<{ pieces: number[]; dot?: { x: number; y: number }; since: number } | null>(null);
  const redraw = useRef<() => void>(() => {});
  const caption = selected ? `${selected.name} on the Guåhan map.` : "The whole island of Guåhan.";

  useEffect(() => {
    const [element, picture] = [canvas.current, image.current];
    if (!element || !picture) return;
    let context: CanvasRenderingContext2D | null = null;
    let sprites: Sprite[] | null = null;
    let layout: Layout | null = null;
    let table = "";
    // The settled section's outline is drawn here first; see draw.
    let ring: HTMLCanvasElement | null = null;
    let dpr = 1;
    let frame = 0;
    let gone = false;

    const draw = (now: number) => {
      frame = 0;
      if (!context || !sprites || !layout) return;
      // The finished map lies flat: no shadows.
      const poses = MAP_CUT.pieces.map((piece) => ({ ...poseAt(MAP_CUT, MAP_PLAN, layout!, piece.index, 1), shadow: 0, still: undefined }));
      const pick = chosen.current;
      const order = MAP_CUT.pieces.map((piece) => piece.index).filter((index) => !pick?.pieces.includes(index));
      // The canvas is opaque, covering the picture beneath it, so a lifted piece leaves an empty slot.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = table;
      context.fillRect(0, 0, element.width, element.height);
      drawFrame(context, sprites, poses, order, dpr, false);
      if (!pick) return;
      const elapsed = reduced ? Infinity : now - pick.since;
      // Everything else steps back a little, so the chosen pieces read at a glance.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "rgba(229, 223, 210, 0.42)";
      context.fillRect(layout.map.x * dpr, layout.map.y * dpr, layout.map.w * dpr, layout.map.h * dpr);
      const unit = layout.map.w / MAP_CUT.width;
      const settled = elapsed >= LIFT_MS + HOLD_MS + SETTLE_MS;
      let shown: Pose[] = poses;
      if (!settled) {
        for (const section of sections(pick.pieces)) {
          const cells = section.map((i) => MAP_CUT.pieces[i].cell);
          const across = (Math.max(...cells.map((c) => c.x + c.w)) - Math.min(...cells.map((c) => c.x))) * unit;
          shown = lifted(shown, section, elapsed, Math.min(MAX_GROW, Math.max(1.25, LIFTED_WIDTH / across)), layout);
        }
      }
      drawFrame(context, sprites, shown, pick.pieces, dpr, false);
      if (!settled) {
        frame = requestAnimationFrame(draw);
        return;
      }
      // One outline around each section. The pieces' outlines, as one shape, are stroked wide on a
      // layer of their own, then everything inside the shape is cut away: only the outer edge stays,
      // and nothing shows through the seams between the section's pieces.
      ring = ring && ring.width === element.width && ring.height === element.height ? ring : Object.assign(document.createElement("canvas"), { width: element.width, height: element.height });
      const rctx = context2d(ring);
      const section = new Path2D();
      for (const i of pick.pieces) section.addPath(outlinePath(MAP_CUT.pieces[i]));
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, ring.width, ring.height);
      rctx.setTransform(unit * dpr, 0, 0, unit * dpr, layout.map.x * dpr, layout.map.y * dpr);
      rctx.lineWidth = 5 / unit;
      rctx.lineJoin = "round";
      rctx.strokeStyle = getComputedStyle(element).getPropertyValue("--color-sun").trim() || "#ed601b";
      rctx.stroke(section);
      rctx.globalCompositeOperation = "destination-out";
      rctx.fill(section);
      rctx.globalCompositeOperation = "source-over";
      // A village whose name is lettered over the water is marked by its dot: a ring round it says which.
      if (pick.dot) {
        rctx.beginPath();
        rctx.arc(pick.dot.x * MAP_CUT.width, pick.dot.y * MAP_CUT.height, 5.5 / unit, 0, Math.PI * 2);
        rctx.lineWidth = 2 / unit;
        rctx.stroke();
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(ring, 0, 0);
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
      table = getComputedStyle(element).getPropertyValue("--color-tile").trim() || "#dbd3c3";
      layout = fitLayout(MAP_CUT, { x: 0, y: 0, w: box.width, h: box.height });
      // The finished map has no pile, so it skips the pre-shadowed images.
      sprites = makeSprites(MAP_CUT, picture, (layout.map.w / MAP_CUT.width) * dpr, dpr, { still: false });
      element.dataset.ready = "";
      schedule();
    };
    let unwatch = () => {};
    const stop = () => {
      gone = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      unwatch();
      redraw.current = () => {};
    };
    // A canvas that can't draw, now or on a later resize, leaves the plain picture in its place.
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
    redraw.current = schedule;
    const resize = new ResizeObserver(remeasure);
    whenLoaded(picture).then(() => {
      if (gone) return;
      context = context2d(element);
      measure();
      resize.observe(element);
      unwatch = watchPixelRatio(remeasure);
    }).catch(fail);
    return stop;
  }, [reduced]);

  function choose(next: string) {
    setSlug(next);
    const village = villages.find((v) => v.slug === next);
    chosen.current = village ? { pieces: villagePieces(village), dot: VILLAGE_DOTS[village.slug], since: performance.now() } : null;
    redraw.current();
  }

  return (
    <section className="home-section village-piece" aria-labelledby={`${id}-heading`} data-village={selected?.slug ?? "whole"} data-lifted={selected ? villagePieces(selected).length : 0}>
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
