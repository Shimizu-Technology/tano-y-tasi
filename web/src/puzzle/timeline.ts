import { pieceAt, random, type Cut } from "./geometry";

// When each piece moves, as fractions of the scroll through the puzzle. Land comes together first,
// then the sea around it, then one last piece. Which pieces are land comes from the map's land mask
// (scripts/build-map-land.mjs); within each, pieces nearest a village go first.
export interface Plan {
  // Per piece, in cut order.
  start: number[];
  end: number[];
  land: boolean[];
  last: number;
  // Where each piece lies before it is placed: fractions of the scatter area, and a turn in radians.
  scatter: { x: number; y: number; turn: number; arc: number }[];
  // Drawing order for the loose pile, bottom first.
  pile: number[];
}

// Chapter boundaries, shared with the copy so the words change as the pieces do.
export const LAND = [0.05, 0.5] as const;
export const SEA = [0.44, 0.86] as const;
export const LAST = [0.84, 0.94] as const;
export const CHAPTERS = [0.1, 0.46, 0.86] as const;

export function chapterAt(progress: number) {
  return CHAPTERS.filter((boundary) => progress >= boundary).length;
}

// The map's land as cells, from scripts/build-map-land.mjs: each row lists runs ("start-end", end exclusive).
export interface LandMask {
  cols: number;
  rows: number;
  runs: string[];
}
/** Reads a land mask into a test for a point given as fractions of the picture. */
export function landAt(mask: LandMask) {
  const cells = mask.runs.map((row) => {
    const line = new Array<boolean>(mask.cols).fill(false);
    for (const run of row.split(",").filter(Boolean)) {
      const [from, to] = run.split("-").map(Number);
      line.fill(true, from, to);
    }
    return line;
  });
  return (fx: number, fy: number) => cells[Math.min(mask.rows - 1, Math.floor(fy * mask.rows))]?.[Math.min(mask.cols - 1, Math.floor(fx * mask.cols))] ?? false;
}

/** A piece is land when most of its cell is. */
export function planPuzzle(cut: Cut, villages: { x: number; y: number }[], lastAt: { x: number; y: number }, seed: number, isLand: (fx: number, fy: number) => boolean): Plan {
  const distance = cut.pieces.map((piece) => {
    const [cx, cy] = [piece.cell.x + piece.cell.w / 2, piece.cell.y + piece.cell.h / 2];
    return Math.min(...villages.map((v) => Math.hypot(v.x * cut.width - cx, v.y * cut.height - cy)));
  });
  const land = cut.pieces.map(({ cell }) => {
    let count = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) count += isLand((cell.x + ((i + 0.5) * cell.w) / 5) / cut.width, (cell.y + ((j + 0.5) * cell.h) / 5) / cut.height) ? 1 : 0;
    return count >= 13;
  });
  const last = pieceAt(cut, lastAt.x, lastAt.y).index;
  const byDistance = (a: number, b: number) => distance[a] - distance[b] || a - b;
  const ids = cut.pieces.map((piece) => piece.index).filter((index) => index !== last);
  const start = new Array<number>(cut.pieces.length).fill(0);
  const end = new Array<number>(cut.pieces.length).fill(0);
  // Pieces in a group start one after another and overlap, so several are in the air at once. The
  // more pieces, the shorter each flight, down to a floor that keeps a flight long enough to see;
  // the 266-piece map has about 15 in the air for the land and 30 for the sea. A piece on its own
  // takes the whole span.
  const schedule = (group: number[], [from, to]: readonly [number, number]) => {
    const span = to - from;
    const each = group.length > 1 ? Math.min(0.16, Math.max(0.06, (span * 10) / group.length)) : span;
    group.forEach((index, i) => {
      start[index] = from + (group.length > 1 ? ((span - each) * i) / (group.length - 1) : 0);
      end[index] = start[index] + each;
    });
  };
  schedule(ids.filter((i) => land[i]).sort(byDistance), LAND);
  schedule(ids.filter((i) => !land[i]).sort(byDistance), SEA);
  schedule([last], LAST);

  // The loose pile: each piece gets its own slot on a jittered grid, so the pile covers the table
  // evenly instead of clumping, then a random turn.
  const next = random(seed ^ 0x9e3779b9);
  const slots = cut.pieces.map((_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const scatter = cut.pieces.map((_, i) => {
    const slot = slots[i];
    const [col, row] = [slot % cut.cols, Math.floor(slot / cut.cols)];
    return {
      x: (col + 0.5 + (next() - 0.5) * 0.7) / cut.cols,
      y: (row + 0.5 + (next() - 0.5) * 0.7) / cut.rows,
      turn: (next() - 0.5) * 1.4,
      arc: (next() - 0.5) * 0.5,
    };
  });
  const pile = cut.pieces.map((_, i) => i).sort((a, b) => scatter[a].arc - scatter[b].arc);
  return { start, end, land, last, scatter, pile };
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** How far along its own move a piece is, 0 (in the pile) to 1 (placed). */
export function pieceProgress(plan: Plan, index: number, progress: number) {
  return clamp01((progress - plan.start[index]) / (plan.end[index] - plan.start[index]));
}
