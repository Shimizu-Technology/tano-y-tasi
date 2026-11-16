import { villages } from "../components/village/villages";
import { contains, cutPuzzle, pieceAt, reverse, type Cubic, type Point } from "./geometry";

const cut = cutPuzzle({ cols: 6, rows: 8, width: 509, height: 640, seed: 7 });
const close = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
const same = (a: Cubic[], b: Cubic[]) => a.length === b.length && a.every((curve, i) => curve.every((p, j) => close(p, b[i][j])));
// A piece's outline is its top, right, bottom and left edges, in that order.
const sides = (outline: Cubic[]) => {
  const out: Cubic[][] = [];
  let side: Cubic[] = [];
  for (const curve of outline) {
    side.push(curve);
    const end = curve[3];
    const corner = [0, 1].every((axis) => {
      const step = axis === 0 ? 509 / 6 : 640 / 8;
      return Math.abs(end[axis] / step - Math.round(end[axis] / step)) < 1e-9;
    });
    if (corner) {
      out.push(side);
      side = [];
    }
  }
  return out;
};

it("cuts the picture into a grid of closed pieces, in reading order", () => {
  expect(cut.pieces).toHaveLength(48);
  cut.pieces.forEach((piece, i) => {
    expect([piece.index, piece.col, piece.row]).toEqual([i, i % 6, Math.floor(i / 6)]);
    const { outline } = piece;
    expect(close(outline[0][0], [piece.cell.x, piece.cell.y])).toBe(true);
    expect(close(outline.at(-1)![3], outline[0][0])).toBe(true);
    outline.slice(1).forEach((curve, j) => expect(close(curve[0], outline[j][3])).toBe(true));
  });
});

it("neighbours share one cut, so every piece fits the next", () => {
  for (const piece of cut.pieces) {
    const [, right, bottom] = sides(piece.outline);
    if (piece.col < 5) expect(same(right, reverse(sides(cut.pieces[piece.index + 1].outline)[3]))).toBe(true);
    if (piece.row < 7) expect(same(bottom, reverse(sides(cut.pieces[piece.index + 6].outline)[0]))).toBe(true);
  }
});

it("gives inner edges knobs and keeps the border straight", () => {
  const corner = sides(cut.pieces[0].outline);
  // Top and left of the corner piece are single straight curves along the picture's edge.
  expect(corner[0]).toHaveLength(1);
  expect(corner[0].every((curve) => curve.every((p) => p[1] === 0))).toBe(true);
  expect(corner[3].every((curve) => curve.every((p) => p[0] === 0))).toBe(true);
  // Its right and bottom edges carry a knob that reaches well past the cell.
  expect(corner[1].length).toBeGreaterThan(1);
  // A knob or socket is four curves, a border edge one: corners have two of each, inner pieces four knobs.
  expect(cut.pieces.map((piece) => piece.outline.length)).toEqual(cut.pieces.map((piece) => {
    const border = Number(piece.col === 0) + Number(piece.col === 5) + Number(piece.row === 0) + Number(piece.row === 7);
    return border + (4 - border) * 4;
  }));
  // Knobs point both ways: some pieces reach out of their cell on a side, others are cut into.
  const outward = cut.pieces.filter((piece) => piece.col < 5 && piece.bounds.x + piece.bounds.w > piece.cell.x + piece.cell.w + 5).length;
  expect(outward).toBeGreaterThan(5);
  expect(outward).toBeLessThan(35);
});

it("cuts the same way every time for a seed, and differently for another", () => {
  const again = cutPuzzle({ cols: 6, rows: 8, width: 509, height: 640, seed: 7 });
  expect(again.pieces.every((piece, i) => same(piece.outline, cut.pieces[i].outline))).toBe(true);
  const other = cutPuzzle({ cols: 6, rows: 8, width: 509, height: 640, seed: 8 });
  expect(other.pieces.every((piece, i) => same(piece.outline, cut.pieces[i].outline))).toBe(false);
});

it("finds the piece under a point by its outline, so a knob belongs to its own piece", () => {
  expect(pieceAt(cut, 0, 0).index).toBe(0);
  expect(pieceAt(cut, 1, 1).index).toBe(47);
  // Across the picture, every point belongs to exactly one piece, and that is the piece found.
  for (let fy = 0.005; fy < 1; fy += 0.0195) {
    for (let fx = 0.005; fx < 1; fx += 0.0195) {
      const [x, y] = [fx * 509, fy * 640];
      expect(cut.pieces.filter((piece) => contains(piece, x, y))).toEqual([pieceAt(cut, fx, fy)]);
    }
  }
  // Every village is inside the piece it lifts. Yigo's and Mangilao's labels sit on knobs that
  // reach into the next cell, so their cells alone would pick the wrong pieces (11 and 27).
  for (const village of villages) expect(contains(pieceAt(cut, village.x, village.y), village.x * 509, village.y * 640)).toBe(true);
  expect(pieceAt(cut, villages.find((v) => v.slug === "yigo")!.x, villages.find((v) => v.slug === "yigo")!.y).index).toBe(10);
  expect(pieceAt(cut, villages.find((v) => v.slug === "mangilao")!.x, villages.find((v) => v.slug === "mangilao")!.y).index).toBe(21);
});
