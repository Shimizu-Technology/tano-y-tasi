import { MAP_CUT, MAP_PLAN } from "./mapPuzzle";
import { fitLayout, layers, poseAt, reach, type Sprite } from "./render";

const layout = fitLayout(MAP_CUT, { x: 16, y: 200, w: 358, h: 555 });
const poses = (progress: number) => MAP_CUT.pieces.map((piece) => poseAt(MAP_CUT, MAP_PLAN, layout, piece.index, progress));

it("fits the finished map inside its box, centered, at the picture's shape", () => {
  expect(layout.map.w).toBeCloseTo(358);
  expect(layout.map.h).toBeCloseTo((358 * 640) / 509);
  expect(layout.map.y - 200).toBeCloseTo(555 - layout.map.h - (layout.map.y - 200));
  // A tall, narrow box fits by width; a wide one by height.
  const wide = fitLayout(MAP_CUT, { x: 0, y: 0, w: 1000, h: 400 });
  expect(wide.map.h).toBeCloseTo(400);
  expect(wide.map.x).toBeCloseTo((1000 - wide.map.w) / 2);
  // The pile's table is a little wider than the map, so pieces spill past its sides, and stays
  // inside its top and bottom.
  expect(layout.table.w).toBeGreaterThan(layout.map.w);
  expect(layout.table.y).toBeGreaterThan(layout.map.y);
  expect(layout.table.y + layout.table.h).toBeLessThan(layout.map.y + layout.map.h);
});

it("lays each piece in the pile turned, then sets it in its cell, square and flat", () => {
  const unit = layout.map.w / MAP_CUT.width;
  const start = poses(0);
  const end = poses(1);
  expect(start.every((pose) => pose.t === 0 && pose.scale === 1)).toBe(true);
  expect(start.filter((pose) => Math.abs(pose.turn) > 0.05).length).toBeGreaterThan(MAP_CUT.pieces.length * 0.6);
  // A piece in the pile or in place is drawn from its image with the shadow drawn in.
  expect(start.every((pose) => pose.still === "rest")).toBe(true);
  expect(end.every((pose) => pose.still === "set")).toBe(true);
  MAP_CUT.pieces.forEach(({ cell }, i) => {
    expect(end[i].t).toBe(1);
    expect(end[i].turn).toBeCloseTo(0);
    expect(end[i].x).toBeCloseTo(layout.map.x + (cell.x + cell.w / 2) * unit);
    expect(end[i].y).toBeCloseTo(layout.map.y + (cell.y + cell.h / 2) * unit);
  });
  // In the air a piece is lifted: larger, with a longer shadow than in the pile or in place.
  const i = MAP_PLAN.last;
  const mid = poseAt(MAP_CUT, MAP_PLAN, layout, i, (MAP_PLAN.start[i] + MAP_PLAN.end[i]) / 2);
  expect(mid.still).toBeUndefined();
  // The last piece is held up large on its way in; others lift a little.
  expect(mid.scale).toBeGreaterThan(1.5);
  const other = MAP_CUT.pieces.findIndex((piece) => piece.index !== MAP_PLAN.last);
  const otherMid = poseAt(MAP_CUT, MAP_PLAN, layout, other, (MAP_PLAN.start[other] + MAP_PLAN.end[other]) / 2);
  expect(otherMid.scale).toBeGreaterThan(1.03);
  expect(otherMid.scale).toBeLessThan(1.15);
  expect(mid.offset).toBeGreaterThan(start[i].offset);
  expect(mid.offset).toBeGreaterThan(end[i].offset);
});

it("layers the pile under the placed pieces under the pieces in the air", () => {
  const at = poses(0.3);
  const { pile, placed, moving } = layers(MAP_PLAN, at);
  expect(pile.length + placed.length + moving.length).toBe(MAP_CUT.pieces.length);
  expect(pile.every((i) => at[i].t === 0)).toBe(true);
  expect(placed.every((i) => at[i].t === 1)).toBe(true);
  expect(moving.every((i) => at[i].t > 0 && at[i].t < 1)).toBe(true);
  // Among the pieces in the air, the highest is drawn last.
  const lift = moving.map((i) => Math.sin(Math.PI * at[i].t));
  expect(lift).toEqual([...lift].sort((a, b) => a - b));
});

it("repaints a square that covers a piece and its shadow at any turn, in whole pixels", () => {
  const image = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;
  const sprite: Sprite = { art: image(100, 80), shadow: image(70, 60), rest: image(143, 123), set: image(143, 123), anchor: [50, 40], shadowAnchor: [35, 30], stillAnchor: [70, 60] };
  const rect = reach(sprite, { x: 100.3, y: 50.7, turn: 0.4, scale: 1.08, t: 0.5, shadow: 0.6, offset: 11.5 }, 2);
  expect([rect.x, rect.y, rect.w, rect.h].every(Number.isInteger)).toBe(true);
  // The shadow, twice the size of its half-resolution image and pushed by the lift, sets the reach here.
  const shadowReach = Math.hypot(35, 30) * 2 * 1.08 + Math.hypot(0.6, 1) * 11.5 * 2;
  expect(rect.x).toBeLessThanOrEqual(100.3 * 2 - shadowReach);
  expect(rect.x + rect.w).toBeGreaterThanOrEqual(100.3 * 2 + shadowReach);
  expect(rect.y + rect.h).toBeGreaterThanOrEqual(50.7 * 2 + shadowReach);
});
