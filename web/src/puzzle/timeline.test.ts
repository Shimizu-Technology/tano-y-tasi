import { villages } from "../components/village/villages";
import { contains, pieceAt } from "./geometry";
import { MAP_LAND } from "./mapLand";
import { MAP_CUT, MAP_PLAN, STAR } from "./mapPuzzle";
import { CHAPTERS, LAND, LAST, SEA, chapterAt, landAt, pieceProgress } from "./timeline";

const ids = MAP_CUT.pieces.map((piece) => piece.index);
// These three names sit in a callout over the water, with lines to their dots on the island.
const callouts = ["agana-heights", "sinajana", "mongmong-toto-maite"];

it("reads the land mask: the island is land, the sea, sky and corners are not", () => {
  const onLand = landAt(MAP_LAND);
  expect(MAP_LAND.runs).toHaveLength(MAP_LAND.rows);
  for (const village of villages.filter((v) => !callouts.includes(v.slug))) expect(onLand(village.x, village.y)).toBe(true);
  for (const village of villages.filter((v) => callouts.includes(v.slug))) expect(onLand(village.x, village.y)).toBe(false);
  expect(onLand(STAR.x, STAR.y)).toBe(true);
  // The Pacific, the Philippine Sea, the title in the sky, and every corner.
  for (const [x, y] of [[0.8, 0.6], [0.15, 0.3], [0.2, 0.1], [0, 0], [1, 0], [0, 1], [1, 1]]) expect(onLand(x, y)).toBe(false);
  // Sand-colored sunset reflections and clouds that touch the coast: in the Philippine Sea, off the
  // east coast, and at the right edge of the sky.
  for (const [x, y] of [[0.18, 0.36], [0.19, 0.4], [0.8, 0.45], [0.82, 0.5], [0.97, 0.15], [0.97, 0.2]]) expect(onLand(x, y)).toBe(false);
  // The Orote peninsula, the island's thin western arm, stays.
  expect(onLand(0.08, 0.47)).toBe(true);
});

it("puts the land together first, then the sea, then the piece with Hagåtña's star last", () => {
  const land = ids.filter((i) => MAP_PLAN.land[i] && i !== MAP_PLAN.last);
  const sea = ids.filter((i) => !MAP_PLAN.land[i] && i !== MAP_PLAN.last);
  // About a third of the map is island; the rest is sea, sky and the title.
  expect(land.length / ids.length).toBeGreaterThan(0.25);
  expect(land.length / ids.length).toBeLessThan(0.45);
  expect(Math.min(...land.map((i) => MAP_PLAN.start[i]))).toBeCloseTo(LAND[0]);
  expect(Math.max(...land.map((i) => MAP_PLAN.end[i]))).toBeCloseTo(LAND[1]);
  expect(Math.min(...sea.map((i) => MAP_PLAN.start[i]))).toBeCloseTo(SEA[0]);
  expect(Math.max(...sea.map((i) => MAP_PLAN.end[i]))).toBeCloseTo(SEA[1]);
  expect(MAP_PLAN.start[MAP_PLAN.last]).toBeCloseTo(LAST[0]);
  expect(MAP_PLAN.end[MAP_PLAN.last]).toBeCloseTo(LAST[1]);
  expect(contains(MAP_CUT.pieces[MAP_PLAN.last], STAR.x * MAP_CUT.width, STAR.y * MAP_CUT.height)).toBe(true);
  // The cells of the two sunset reflections are sea, not land arriving early.
  for (const [x, y] of [[0.18, 0.39], [0.82, 0.45]]) expect(MAP_PLAN.land[pieceAt(MAP_CUT, x, y).index]).toBe(false);
  // Every village on the island is on a land piece.
  for (const village of villages.filter((v) => !callouts.includes(v.slug))) expect(MAP_PLAN.land[pieceAt(MAP_CUT, village.x, village.y).index]).toBe(true);
});

it("gives every village a piece of its own", () => {
  const pieces = villages.map((village) => pieceAt(MAP_CUT, village.x, village.y).index);
  expect(new Set(pieces).size).toBe(villages.length);
  villages.forEach((village, i) => expect(contains(MAP_CUT.pieces[pieces[i]], village.x * MAP_CUT.width, village.y * MAP_CUT.height)).toBe(true));
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
  // Several pieces are in the air at once, never most of them.
  const flying = (p: number) => ids.filter((i) => pieceProgress(MAP_PLAN, i, p) % 1 !== 0).length;
  for (const p of [0.2, 0.3, 0.6, 0.7]) {
    expect(flying(p)).toBeGreaterThan(4);
    expect(flying(p)).toBeLessThan(40);
  }
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
