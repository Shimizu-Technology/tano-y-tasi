import { villages } from "../components/village/villages";
import { pieceAt } from "./geometry";
import { MAP_CUT, namePieces } from "./mapPuzzle";
import { VILLAGE_LABELS } from "./villageLabels";

it("knows where every village's name is lettered, around its point on the map", () => {
  for (const village of villages) {
    const [x0, y0, x1, y1] = VILLAGE_LABELS[village.slug].box;
    expect([village.slug, x0 < village.x && village.x < x1 && y0 < village.y && village.y < y1]).toEqual([village.slug, true]);
    // A word or two lines of lettering: wider than tall, and never a sliver or half the map.
    expect(x1 - x0).toBeGreaterThan(0.02);
    expect(x1 - x0).toBeLessThan(0.2);
    expect(y1 - y0).toBeGreaterThan(0.005);
    expect(y1 - y0).toBeLessThan(0.04);
  }
  // The three names in the callout over the water sit one under another without overlapping.
  const [a, s, m] = ["agana-heights", "sinajana", "mongmong-toto-maite"].map((slug) => VILLAGE_LABELS[slug].box);
  expect(a[3]).toBeLessThanOrEqual(s[1]);
  expect(s[3]).toBeLessThanOrEqual(m[1]);
});

// The units of a village's name that hold letters, as fractions of the picture.
function letters(slug: string) {
  const { x, y, w, h, bits } = VILLAGE_LABELS[slug].ink;
  const out: [number, number][] = [];
  for (let i = 0; i < w * h; i++) if ((parseInt(bits[i >> 2], 16) >> (3 - (i & 3))) & 1) out.push([(x + (i % w) + 0.5) / MAP_CUT.width, (y + Math.floor(i / w) + 0.5) / MAP_CUT.height]);
  return out;
}

it("knows which spots hold each name's letters, inside its box and plenty of them", () => {
  for (const village of villages) {
    const [x0, y0, x1, y1] = VILLAGE_LABELS[village.slug].box;
    const spots = letters(village.slug);
    // Short names like Piti still have dozens; the box is never mostly letters.
    expect(spots.length).toBeGreaterThan(25);
    const units = VILLAGE_LABELS[village.slug].ink.w * VILLAGE_LABELS[village.slug].ink.h;
    expect(spots.length / units).toBeLessThan(0.8);
    // Allow one unit of rounding at the box's edges.
    for (const [x, y] of spots) {
      expect(x).toBeGreaterThan(x0 - 1 / MAP_CUT.width);
      expect(x).toBeLessThan(x1 + 1 / MAP_CUT.width);
      expect(y).toBeGreaterThan(y0 - 1 / MAP_CUT.height);
      expect(y).toBeLessThan(y1 + 1 / MAP_CUT.height);
    }
  }
});

it("lifts every piece a village's name is lettered on, and no piece without its letters", () => {
  const find = (slug: string) => namePieces(villages.find((v) => v.slug === slug)!);
  for (const village of villages) {
    const pieces = namePieces(village);
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    expect(pieces.length).toBeLessThanOrEqual(4);
    expect(new Set(pieces).size).toBe(pieces.length);
    // Each lifted piece holds several of the name's letter spots; a piece holding many is never left out.
    const counts = new Map<number, number>();
    for (const [x, y] of letters(village.slug)) counts.set(pieceAt(MAP_CUT, x, y).index, (counts.get(pieceAt(MAP_CUT, x, y).index) ?? 0) + 1);
    for (const index of pieces) expect(counts.get(index)).toBeGreaterThanOrEqual(4);
    for (const [index, count] of counts) if (count >= 4) expect(pieces).toContain(index);
  }
  // Tamuning's name runs across two pieces; Talofofo's sits on the corner of four.
  expect([...find("tamuning")].sort((a, b) => a - b)).toEqual([105, 106]);
  expect(find("talofofo")).toHaveLength(4);
  // Pieces that only cross the corner of a name's box, with no letters on them, stay put.
  expect(find("barrigada")).not.toContain(121);
  expect(find("inalahan")).toEqual([188]);
  // Asked again, the same answer, without working it out twice.
  expect(namePieces(villages[0])).toBe(namePieces(villages[0]));
});
