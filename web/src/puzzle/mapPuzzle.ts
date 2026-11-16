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

// A piece shows a village's name when it holds at least this share of the name's lettering box.
const NAME_SHARE = 0.03;
const named = new Map<string, number[]>();
/**
 * The pieces a village's name is lettered on (VILLAGE_LABELS, from scripts/build-village-labels.mjs),
 * most of the name first. Worked out the first time a village is asked for.
 */
export function namePieces(village: Village): number[] {
  const known = named.get(village.slug);
  if (known) return known;
  const box = VILLAGE_LABELS[village.slug];
  let pieces = [pieceAt(MAP_CUT, village.x, village.y).index];
  if (box) {
    const [x0, y0, x1, y1] = [box[0] * MAP_CUT.width, box[1] * MAP_CUT.height, box[2] * MAP_CUT.width, box[3] * MAP_CUT.height];
    const counts = new Map<number, number>();
    let total = 0;
    // One sample per picture unit across the box.
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1) {
        const index = pieceAt(MAP_CUT, x / MAP_CUT.width, y / MAP_CUT.height).index;
        counts.set(index, (counts.get(index) ?? 0) + 1);
        total += 1;
      }
    pieces = [...counts].filter(([, count]) => count / total >= NAME_SHARE).sort((a, b) => b[1] - a[1]).map(([index]) => index);
  }
  named.set(village.slug, pieces);
  return pieces;
}
