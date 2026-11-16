// Jigsaw cuts for a picture: a grid whose inner edges carry the classic knob. Pure geometry in
// the picture's own units, so it can be tested and drawn at any size.
export type Point = readonly [number, number];
// One cubic Bézier: start, two controls, end.
export type Cubic = readonly [Point, Point, Point, Point];
export interface Piece {
  index: number;
  col: number;
  row: number;
  // The cell, before knobs.
  cell: { x: number; y: number; w: number; h: number };
  // Clockwise outline from the cell's top-left corner.
  outline: Cubic[];
  // Every point of the outline, controls included, lies inside.
  bounds: { x: number; y: number; w: number; h: number };
}
export interface Cut {
  cols: number;
  rows: number;
  width: number;
  height: number;
  pieces: Piece[];
}

// A small seeded generator, so a picture is always cut the same way.
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A knob in edge space: u runs along the edge (0 to 1), v away from it in edge lengths.
// The shoulders dip slightly the other way, the neck narrows, the head is wider than the neck.
function knob(next: () => number): Cubic[] {
  const j = (amount: number) => (next() * 2 - 1) * amount;
  const m = 0.5 + j(0.04);
  const neck = 0.07 + j(0.008);
  const head = 0.125 + j(0.012);
  const h = 0.24 + j(0.02);
  const dip = 0.025 + j(0.01);
  return [
    [[0, 0], [m * 0.55, 0], [m - neck + 0.005, -dip], [m - neck, dip]],
    [[m - neck, dip], [m - neck + 0.012, h * 0.45], [m - head - 0.05, h * 1.02], [m, h]],
    [[m, h], [m + head + 0.05, h * 1.02], [m + neck - 0.012, h * 0.45], [m + neck, dip]],
    [[m + neck, dip], [m + neck - 0.005, -dip], [m + (1 - m) * 0.45, 0], [1, 0]],
  ];
}
const straight: Cubic[] = [[[0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0]]];

// Places an edge-space path between two points; `side` (1 or -1) picks which way the knob points.
function place(shape: Cubic[], from: Point, to: Point, side: number): Cubic[] {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dy);
  // The normal is the direction turned clockwise on screen (y grows downward).
  const [nx, ny] = [(-dy / length) * side, (dx / length) * side];
  const at = ([u, v]: Point): Point => [from[0] + dx * u + nx * v * length, from[1] + dy * u + ny * v * length];
  return shape.map(([a, b, c, d]) => [at(a), at(b), at(c), at(d)]);
}
export function reverse(edge: Cubic[]): Cubic[] {
  return [...edge].reverse().map(([a, b, c, d]) => [d, c, b, a]);
}

/** Cuts a width × height picture into cols × rows pieces. The same seed always gives the same cut. */
export function cutPuzzle({ cols, rows, width, height, seed }: { cols: number; rows: number; width: number; height: number; seed: number }): Cut {
  const next = random(seed);
  const cw = width / cols;
  const ch = height / rows;
  const corner = (c: number, r: number): Point => [c * cw, r * ch];
  // Horizontal edges run left to right along row lines; vertical edges top to bottom along column lines.
  const horizontal: Cubic[][][] = [];
  for (let r = 0; r <= rows; r++) {
    horizontal.push([]);
    for (let c = 0; c < cols; c++) {
      const inner = r > 0 && r < rows;
      horizontal[r].push(place(inner ? knob(next) : straight, corner(c, r), corner(c + 1, r), inner && next() < 0.5 ? -1 : 1));
    }
  }
  const vertical: Cubic[][][] = [];
  for (let c = 0; c <= cols; c++) {
    vertical.push([]);
    for (let r = 0; r < rows; r++) {
      const inner = c > 0 && c < cols;
      vertical[c].push(place(inner ? knob(next) : straight, corner(c, r), corner(c, r + 1), inner && next() < 0.5 ? -1 : 1));
    }
  }
  const pieces: Piece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const outline = [...horizontal[r][c], ...vertical[c + 1][r], ...reverse(horizontal[r + 1][c]), ...reverse(vertical[c][r])];
      const xs = outline.flatMap((curve) => curve.map((p) => p[0]));
      const ys = outline.flatMap((curve) => curve.map((p) => p[1]));
      const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
      pieces.push({
        index: pieces.length,
        col: c,
        row: r,
        cell: { x: c * cw, y: r * ch, w: cw, h: ch },
        outline,
        bounds: { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 },
      });
    }
  }
  return { cols, rows, width, height, pieces };
}

/** The piece whose cell holds a point given as fractions of the picture. */
export function pieceAt(cut: Cut, fx: number, fy: number): Piece {
  const col = Math.min(cut.cols - 1, Math.max(0, Math.floor(fx * cut.cols)));
  const row = Math.min(cut.rows - 1, Math.max(0, Math.floor(fy * cut.rows)));
  return cut.pieces[row * cut.cols + col];
}
