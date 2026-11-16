import { villages } from "../components/village/villages";
import { MAP_CUT, MAP_PLAN } from "./mapPuzzle";
import { CHAPTERS, LAND, LAST, SEA, chapterAt, pieceProgress } from "./timeline";

const ids = MAP_CUT.pieces.map((piece) => piece.index);
const hagatna = villages.find((village) => village.slug === "hagatna")!;

it("puts the land together first, then the sea, then Hagåtña's piece last", () => {
  const land = ids.filter((i) => MAP_PLAN.land[i] && i !== MAP_PLAN.last);
  const sea = ids.filter((i) => !MAP_PLAN.land[i] && i !== MAP_PLAN.last);
  // About half the map is island; the rest is sea, sky and the title.
  expect(land.length).toBeGreaterThan(15);
  expect(sea.length).toBeGreaterThan(15);
  expect(Math.min(...land.map((i) => MAP_PLAN.start[i]))).toBeCloseTo(LAND[0]);
  expect(Math.max(...land.map((i) => MAP_PLAN.end[i]))).toBeCloseTo(LAND[1]);
  expect(Math.min(...sea.map((i) => MAP_PLAN.start[i]))).toBeCloseTo(SEA[0]);
  expect(Math.max(...sea.map((i) => MAP_PLAN.end[i]))).toBeCloseTo(SEA[1]);
  expect(MAP_PLAN.start[MAP_PLAN.last]).toBeCloseTo(LAST[0]);
  expect(MAP_PLAN.end[MAP_PLAN.last]).toBeCloseTo(LAST[1]);
  const piece = MAP_CUT.pieces[MAP_PLAN.last];
  expect(hagatna.x * MAP_CUT.width).toBeGreaterThanOrEqual(piece.cell.x);
  expect(hagatna.x * MAP_CUT.width).toBeLessThan(piece.cell.x + piece.cell.w);
  // Every village's own piece is land.
  for (const village of villages) {
    const at = MAP_CUT.pieces.find((p) => village.x * MAP_CUT.width >= p.cell.x && village.x * MAP_CUT.width < p.cell.x + p.cell.w && village.y * MAP_CUT.height >= p.cell.y && village.y * MAP_CUT.height < p.cell.y + p.cell.h)!;
    expect(MAP_PLAN.land[at.index]).toBe(true);
  }
});

it("has every piece in the pile at the top and placed by the end, moving forward only", () => {
  expect(ids.every((i) => pieceProgress(MAP_PLAN, i, 0) === 0)).toBe(true);
  expect(ids.every((i) => pieceProgress(MAP_PLAN, i, 0.95) === 1)).toBe(true);
  for (const i of ids) {
    expect(MAP_PLAN.end[i]).toBeGreaterThan(MAP_PLAN.start[i]);
    let before = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      const t = pieceProgress(MAP_PLAN, i, p);
      expect(t).toBeGreaterThanOrEqual(before);
      before = t;
    }
  }
  // Several pieces are in the air at once, never all of them.
  const flying = (p: number) => ids.filter((i) => pieceProgress(MAP_PLAN, i, p) % 1 !== 0).length;
  expect(flying(0.3)).toBeGreaterThan(2);
  expect(flying(0.3)).toBeLessThan(20);
});

it("spreads the pile evenly, one piece to a slot, each turned", () => {
  const slots = new Set(MAP_PLAN.scatter.map((s) => `${Math.floor(s.x * 6)},${Math.floor(s.y * 8)}`));
  expect(slots.size).toBeGreaterThan(40);
  expect(MAP_PLAN.scatter.every((s) => s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1 && Math.abs(s.turn) <= 0.7)).toBe(true);
  expect([...MAP_PLAN.pile].sort((a, b) => a - b)).toEqual(ids);
});

it("changes the words as the pieces do", () => {
  expect([0, CHAPTERS[0] - 0.01, CHAPTERS[0], CHAPTERS[1], CHAPTERS[2], 1].map(chapterAt)).toEqual([0, 0, 1, 2, 3, 3]);
  // The sea chapter starts as the sea pieces do, the last as the final piece flies.
  expect(CHAPTERS[1]).toBeGreaterThanOrEqual(SEA[0]);
  expect(CHAPTERS[2]).toBeGreaterThanOrEqual(LAST[0]);
});
