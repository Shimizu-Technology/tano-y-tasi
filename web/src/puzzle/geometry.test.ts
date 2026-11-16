import { cutPuzzle, pieceAt, reverse, type Cubic, type Point } from "./geometry";

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

it("finds the piece under a point given as fractions of the picture, edges included", () => {
  expect(pieceAt(cut, 0, 0).index).toBe(0);
  expect(pieceAt(cut, 1, 1).index).toBe(47);
  // Hagåtña's label sits in the third column, fourth row.
  expect([pieceAt(cut, 0.3571, 0.4439).col, pieceAt(cut, 0.3571, 0.4439).row]).toEqual([2, 3]);
});
