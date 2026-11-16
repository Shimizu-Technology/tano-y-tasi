import { villages } from "../components/village/villages";
import { PUZZLE_ART } from "./art";
import { cutPuzzle } from "./geometry";
import { planPuzzle } from "./timeline";

// The map's cut and the order it comes together in, shared by the hero and the village finder.
// Large pieces read on a phone; this is an illustration of the puzzle, not its real cut.
export const MAP_CUT = cutPuzzle({ cols: 6, rows: 8, width: PUZZLE_ART.width, height: PUZZLE_ART.height, seed: 7 });
// The capital's piece, with its star, goes in last.
const lastVillage = villages.find((village) => village.slug === "hagatna") ?? villages[0];
export const MAP_PLAN = planPuzzle(MAP_CUT, villages, lastVillage, 7);
