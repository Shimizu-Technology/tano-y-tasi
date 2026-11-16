import type { Cut, Piece } from "./geometry";
import { easeInOut, easeOut, pieceProgress, type Plan } from "./timeline";

type Rect = { x: number; y: number; w: number; h: number };
// Where the finished map sits and the table its pieces lie on, in CSS pixels of the canvas.
export interface Layout {
  map: Rect;
  table: Rect;
}
export interface Pose {
  x: number;
  y: number;
  turn: number;
  scale: number;
  // 0 lying in the pile, 1 placed.
  t: number;
  shadow: number;
  offset: number;
}

/** The finished map fitted inside a box, centered; and the table the pile is spread on. */
export function fitLayout(cut: Cut, box: Rect): Layout {
  const w = Math.min(box.w, (box.h * cut.width) / cut.height);
  const h = (w * cut.height) / cut.width;
  const map = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  // Wider than the map, so pieces spill past its sides; half a piece in from its top and bottom, so
  // the pile stays clear of the words above and the buttons below.
  const inset = h / cut.rows / 2;
  return { map, table: { x: map.x - w * 0.1, y: map.y + inset, w: w * 1.2, h: h - inset * 2 } };
}

/** Where a piece is at a point in the scroll: lifted out of the pile, carried on a slight arc, set down. */
export function poseAt(cut: Cut, plan: Plan, layout: Layout, index: number, progress: number): Pose {
  const { cell } = cut.pieces[index];
  const unit = layout.map.w / cut.width;
  const home = [layout.map.x + (cell.x + cell.w / 2) * unit, layout.map.y + (cell.y + cell.h / 2) * unit];
  const loose = plan.scatter[index];
  const from = [layout.table.x + loose.x * layout.table.w, layout.table.y + loose.y * layout.table.h];
  const t = pieceProgress(plan, index, progress);
  const e = easeInOut(t);
  const lift = Math.sin(Math.PI * t);
  const [dx, dy] = [home[0] - from[0], home[1] - from[1]];
  // The arc bows sideways by a share of the distance travelled, more for long moves.
  const bow = loose.arc * 0.35 * lift;
  return {
    x: from[0] + dx * e - dy * bow,
    y: from[1] + dy * e + dx * bow,
    turn: loose.turn * (1 - easeOut(t)),
    scale: 1 + 0.08 * lift,
    t,
    // Placed pieces keep a faint shadow so the puzzle sits above the pile until the pile is gone.
    shadow: t >= 1 ? 0.14 : 0.3 + 0.3 * lift,
    offset: t >= 1 ? 0.75 : 1.5 + 10 * lift,
  };
}

/**
 * The pieces in three layers, each bottom first: the loose pile, the placed pieces, and the pieces in
 * the air, highest last. Only the pieces in the air change every frame.
 */
export function layers(plan: Plan, poses: Pose[]) {
  return {
    pile: plan.pile.filter((i) => poses[i].t === 0),
    placed: plan.pile.filter((i) => poses[i].t === 1),
    moving: plan.pile.filter((i) => poses[i].t > 0 && poses[i].t < 1).sort((a, b) => Math.sin(Math.PI * poses[a].t) - Math.sin(Math.PI * poses[b].t)),
  };
}

// The square, in whole device pixels, that a piece and its shadow can cover at a pose, whatever its turn.
export function reach(sprite: Sprite, pose: Pose, dpr: number): Rect {
  const corner = (anchor: [number, number], image: HTMLCanvasElement) => Math.hypot(Math.max(anchor[0], image.width - anchor[0]), Math.max(anchor[1], image.height - anchor[1]));
  const art = corner(sprite.anchor, sprite.art) * pose.scale;
  const shadow = (corner(sprite.shadowAnchor, sprite.shadow) / SHADOW_SCALE) * pose.scale + Math.hypot(0.6, 1) * pose.offset * dpr;
  const r = Math.max(art, shadow) + 2;
  const [x, y] = [Math.floor(pose.x * dpr - r), Math.floor(pose.y * dpr - r)];
  return { x, y, w: Math.ceil(pose.x * dpr + r) - x, h: Math.ceil(pose.y * dpr + r) - y };
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * A canvas of pieces that hold still, like the pile or the placed puzzle. When pieces join or
 * leave, only the squares around them are repainted, with whatever else lies there.
 */
export function stillLayer(ctx: CanvasRenderingContext2D) {
  const drawn = new Map<number, Rect>();
  return {
    reset() {
      drawn.clear();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    update(sprites: Sprite[], poses: Pose[], order: number[], dpr: number) {
      const members = new Set(order);
      const dirty: Rect[] = [];
      for (const [index, rect] of drawn) {
        if (!members.has(index)) {
          dirty.push(rect);
          drawn.delete(index);
        }
      }
      for (const index of order) {
        if (!drawn.has(index)) {
          const rect = reach(sprites[index], poses[index], dpr);
          drawn.set(index, rect);
          dirty.push(rect);
        }
      }
      if (!dirty.length) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      for (const r of dirty) ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      for (const r of dirty) ctx.clearRect(r.x, r.y, r.w, r.h);
      drawFrame(ctx, sprites, poses, order.filter((index) => dirty.some((r) => overlaps(r, drawn.get(index)!))), dpr, false);
      ctx.restore();
    },
  };
}

let support: boolean | undefined;
/** Whether this browser draws on 2D canvases. Asked once. */
export function canDraw() {
  if (support === undefined) {
    try {
      support = typeof CanvasRenderingContext2D !== "undefined" && typeof Path2D !== "undefined" && !!document.createElement("canvas").getContext("2d");
    } catch {
      support = false;
    }
  }
  return support;
}

/** Resolves once the picture has loaded, decoded where the browser can do it ahead of drawing. */
export function whenLoaded(image: HTMLImageElement) {
  return new Promise<void>((resolve, reject) => {
    const done = () => (image.naturalWidth ? image.decode().catch(() => undefined).then(() => resolve()) : reject(new Error("The picture didn't load")));
    if (image.complete) done();
    else {
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", () => reject(new Error("The picture didn't load")), { once: true });
    }
  });
}

export function outlinePath(piece: Piece) {
  const path = new Path2D();
  path.moveTo(...piece.outline[0][0]);
  for (const [, b, c, d] of piece.outline) path.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]);
  path.closePath();
  return path;
}

export interface Sprite {
  art: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  // The cell's center inside each image, in that image's pixels.
  anchor: [number, number];
  shadowAnchor: [number, number];
}
const SHADOW_SCALE = 0.5;

function canvas(w: number, h: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, Math.ceil(w));
  element.height = Math.max(1, Math.ceil(h));
  return element;
}

/**
 * Draws every piece once, at `scale` device pixels per picture unit: the art inside its outline
 * with a fine pressed cut line, and a soft shadow at half resolution. Frames only stamp these.
 */
export function makeSprites(cut: Cut, image: CanvasImageSource, scale: number, dpr: number): Sprite[] {
  const pad = 2;
  const blur = 5 * dpr * SHADOW_SCALE;
  const shadowPad = Math.ceil(blur * 2 + 2);
  return cut.pieces.map((piece) => {
    const path = outlinePath(piece);
    const { bounds: b, cell } = piece;
    const art = canvas(b.w * scale + pad * 2, b.h * scale + pad * 2);
    const ctx = art.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, pad - b.x * scale, pad - b.y * scale);
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(image, 0, 0, cut.width, cut.height);
    // A pressed cut: a light line just inside the edge, and a darker one at the edge itself.
    ctx.lineWidth = (2.2 * dpr) / scale;
    ctx.strokeStyle = "rgba(255, 244, 226, 0.32)";
    ctx.stroke(path);
    ctx.lineWidth = (1.1 * dpr) / scale;
    ctx.strokeStyle = "rgba(42, 20, 8, 0.6)";
    ctx.stroke(path);
    ctx.restore();

    // Only the shadow of a filled outline: the shape is drawn off the canvas and its shadow offset back in.
    const s = scale * SHADOW_SCALE;
    const shadow = canvas(b.w * s + shadowPad * 2, b.h * s + shadowPad * 2);
    const sctx = shadow.getContext("2d")!;
    const away = shadow.width + 50;
    sctx.shadowColor = "rgba(46, 22, 8, 0.75)";
    sctx.shadowBlur = blur;
    sctx.shadowOffsetX = away;
    sctx.setTransform(s, 0, 0, s, shadowPad - b.x * s - away, shadowPad - b.y * s);
    sctx.fill(path);

    const [cx, cy] = [cell.x + cell.w / 2 - b.x, cell.y + cell.h / 2 - b.y];
    return { art, shadow, anchor: [pad + cx * scale, pad + cy * scale], shadowAnchor: [shadowPad + cx * s, shadowPad + cy * s] };
  });
}

/** Stamps the pieces in `order` at their poses. Positions are CSS pixels; the context draws in device pixels. */
export function drawFrame(ctx: CanvasRenderingContext2D, sprites: Sprite[], poses: Pose[], order: number[], dpr: number, clear = true) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (clear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const index of order) {
    const pose = poses[index];
    const sprite = sprites[index];
    const cos = Math.cos(pose.turn) * pose.scale;
    const sin = Math.sin(pose.turn) * pose.scale;
    const x = pose.x * dpr;
    const y = pose.y * dpr;
    if (pose.shadow > 0) {
      const k = 1 / SHADOW_SCALE;
      ctx.globalAlpha = pose.shadow;
      ctx.setTransform(cos * k, sin * k, -sin * k, cos * k, x + pose.offset * 0.6 * dpr, y + pose.offset * dpr);
      ctx.drawImage(sprite.shadow, -sprite.shadowAnchor[0], -sprite.shadowAnchor[1]);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(cos, sin, -sin, cos, x, y);
    ctx.drawImage(sprite.art, -sprite.anchor[0], -sprite.anchor[1]);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
