import { pieceAt, random, type Cut } from "./geometry";

// When each piece moves, as fractions of the scroll through the puzzle. Land comes together first,
// then the sea around it, then one last piece. The order comes from where the villages are, so a
// new map only needs its village positions.
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

/** A piece is land when a village sits within one cell of it. */
export function planPuzzle(cut: Cut, villages: { x: number; y: number }[], lastAt: { x: number; y: number }, seed: number): Plan {
  const size = Math.min(cut.width / cut.cols, cut.height / cut.rows);
  const distance = cut.pieces.map((piece) => {
    const [cx, cy] = [piece.cell.x + piece.cell.w / 2, piece.cell.y + piece.cell.h / 2];
    return Math.min(...villages.map((v) => Math.hypot(v.x * cut.width - cx, v.y * cut.height - cy))) / size;
  });
  const last = pieceAt(cut, lastAt.x, lastAt.y).index;
  const land = distance.map((d) => d < 1);
  const byDistance = (a: number, b: number) => distance[a] - distance[b] || a - b;
  const ids = cut.pieces.map((piece) => piece.index).filter((index) => index !== last);
  const start = new Array<number>(cut.pieces.length).fill(0);
  const end = new Array<number>(cut.pieces.length).fill(0);
  // Pieces in a group start one after another and overlap, so several are in the air at once.
  // A piece on its own takes the whole span.
  const schedule = (group: number[], [from, to]: readonly [number, number]) => {
    const span = to - from;
    const each = group.length > 1 ? Math.min(0.16, span * 0.4) : span;
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
