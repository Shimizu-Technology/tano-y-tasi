import { villages } from "../components/village/villages";
import { contains, pieceAt } from "./geometry";
import { MAP_CUT, namePieces } from "./mapPuzzle";
import { VILLAGE_LABELS } from "./villageLabels";

it("knows where every village's name is lettered, around its point on the map", () => {
  for (const village of villages) {
    const [x0, y0, x1, y1] = VILLAGE_LABELS[village.slug];
    expect([village.slug, x0 < village.x && village.x < x1 && y0 < village.y && village.y < y1]).toEqual([village.slug, true]);
    // A word or two lines of lettering: wider than tall, and never a sliver or half the map.
    expect(x1 - x0).toBeGreaterThan(0.02);
    expect(x1 - x0).toBeLessThan(0.2);
    expect(y1 - y0).toBeGreaterThan(0.005);
    expect(y1 - y0).toBeLessThan(0.04);
  }
  // The three names in the callout over the water sit one under another without overlapping.
  const [a, s, m] = ["agana-heights", "sinajana", "mongmong-toto-maite"].map((slug) => VILLAGE_LABELS[slug]);
  expect(a[3]).toBeLessThanOrEqual(s[1]);
  expect(s[3]).toBeLessThanOrEqual(m[1]);
});

it("finds every piece a village's name is on", () => {
  for (const village of villages) {
    const pieces = namePieces(village);
    const [x0, y0, x1, y1] = VILLAGE_LABELS[village.slug].map((v, i) => v * (i % 2 ? MAP_CUT.height : MAP_CUT.width));
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    expect(pieces.length).toBeLessThanOrEqual(5);
    expect(new Set(pieces).size).toBe(pieces.length);
    // The piece under the village's point is one of them, and every one holds part of the name.
    expect(pieces).toContain(pieceAt(MAP_CUT, village.x, village.y).index);
    for (const index of pieces) {
      let inside = 0;
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (contains(MAP_CUT.pieces[index], x, y)) inside++;
      expect(inside).toBeGreaterThan(0);
    }
  }
  // Tamuning's name runs across two pieces; Talofofo's sits on the corner of four.
  expect(namePieces(villages.find((v) => v.slug === "tamuning")!)).toHaveLength(2);
  expect(namePieces(villages.find((v) => v.slug === "talofofo")!)).toHaveLength(4);
  // Asked again, the same answer, without working it out twice.
  expect(namePieces(villages[0])).toBe(namePieces(villages[0]));
});
