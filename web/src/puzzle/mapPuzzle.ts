import { villages, type Village } from "../components/village/villages";
import { PUZZLE_ART } from "./art";
import { cutPuzzle, pieceAt } from "./geometry";
import { MAP_LAND } from "./mapLand";
import { landAt, planPuzzle } from "./timeline";
import { VILLAGE_LABELS } from "./villageLabels";

// The map's cut and the order it comes together in, shared by the hero and the village finder.
// About as many pieces as the real puzzle (250); at 14 × 19 every village's name sits on a piece of
// its own (geometry tests check it). This is an illustration of the puzzle, not its real cut.
export const MAP_CUT = cutPuzzle({ cols: 14, rows: 19, width: PUZZLE_ART.width, height: PUZZLE_ART.height, seed: 1 });
// Hagåtña's star, the capital's mark on the map, goes in last. Fractions of the picture.
export const STAR = { x: 0.4328, y: 0.4364 };
export const MAP_PLAN = planPuzzle(MAP_CUT, villages, STAR, 1, landAt(MAP_LAND));

// A piece shows a village's name when at least this many picture units of its letters are on it:
// more than a stray speck at the edge of a letter.
const LETTER_UNITS = 4;
// Three names are lettered over the water, with lines to red dots beside Hagåtña's star. The dot is
// where the village is, so its piece is the one that lifts. Fractions of the picture, from the art.
export const VILLAGE_DOTS: Record<string, { x: number; y: number }> = {
  "agana-heights": { x: 0.4541, y: 0.4164 },
  "sinajana": { x: 0.4305, y: 0.4122 },
  "mongmong-toto-maite": { x: 0.4126, y: 0.4226 },
};
const lifted = new Map<string, number[]>();
/**
 * The pieces that lift for a village, most of it first: the pieces its name is lettered on
 * (VILLAGE_LABELS, from scripts/build-village-labels.mjs), or, for a name lettered over the water, the
 * piece its dot is on. Worked out the first time a village is asked for.
 */
export function villagePieces(village: Village): number[] {
  const known = lifted.get(village.slug);
  if (known) return known;
  const label = VILLAGE_LABELS[village.slug];
  const dot = VILLAGE_DOTS[village.slug];
  let pieces = [pieceAt(MAP_CUT, village.x, village.y).index];
  if (dot) {
    // One piece, the one under the dot's centre: the dots sit close to the seams, and the pieces beside
    // them hold other names. The settled piece rings the dot (VillagePiece).
    pieces = [pieceAt(MAP_CUT, dot.x, dot.y).index];
  } else if (label) {
    const { x, y, w, h, bits } = label.ink;
    const counts = new Map<number, number>();
    for (let i = 0; i < w * h; i++) {
      if (!((parseInt(bits[i >> 2], 16) >> (3 - (i & 3))) & 1)) continue;
      const index = pieceAt(MAP_CUT, (x + (i % w) + 0.5) / MAP_CUT.width, (y + Math.floor(i / w) + 0.5) / MAP_CUT.height).index;
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
    const lettered = [...counts].filter(([, count]) => count >= LETTER_UNITS).sort((a, b) => b[1] - a[1]).map(([index]) => index);
    if (lettered.length) pieces = lettered;
  }
  lifted.set(village.slug, pieces);
  return pieces;
}
