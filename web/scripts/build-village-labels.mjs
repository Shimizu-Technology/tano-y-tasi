// Usage: node --experimental-strip-types scripts/build-village-labels.mjs   (run from web/; needs ImageMagick)
// Finds where each village's name is lettered on the Guåhan map, and which spots hold its letters,
// so "Find your village" can lift every piece its name is on. Rerun it whenever the map artwork or the village positions change; it
// rewrites src/puzzle/villageLabels.ts. Check the result: src/puzzle/villageLabels.test.ts.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { villages } from "../src/components/village/villages.ts";

const [W, H] = [1590, 2000];
const rgb = execFileSync("magick", ["public/images/products/guahan-sunset-map/artwork-2000.webp", "-resize", `${W}x${H}!`, "-depth", "8", "rgb:-"], { maxBuffer: 1 << 26 });

// Three names are lettered in cream, one under another, in a callout over the water, with lines to
// their dots on the island. Thin cream letters on dark water don't separate cleanly, so these are
// measured by hand: fractions of the picture, left, top, right, bottom.
const CALLOUTS = {
  "agana-heights": [0.2478, 0.3535, 0.3535, 0.3625],
  sinajana: [0.283, 0.368, 0.3447, 0.3765],
  "mongmong-toto-maite": [0.1925, 0.381, 0.3517, 0.3895],
};

function hls(i) {
  const [r, g, b] = [rgb[i * 3] / 255, rgb[i * 3 + 1] / 255, rgb[i * 3 + 2] / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  if (max !== min) h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return [(h * 60 + 360) % 360, l];
}
// The names on the island are lettered in dark navy; those in the callout over the water in cream.
const ink = (x, y) => {
  const [h, l] = hls(y * W + x);
  return l < 0.42 && h >= 200 && h <= 275;
};
const cream = (x, y) => {
  const [h, l] = hls(y * W + x);
  return l > 0.78 && h >= 20 && h <= 70;
};

/**
 * The lettering nearest a village's point: letters a few pixels apart join, and so do two lines of
 * one name. Returns its box, in pixels, and a test for whether a pixel is one of its letters.
 */
function label(village) {
  const [cx, cy] = [Math.round(village.x * W), Math.round(village.y * H)];
  const [x0, y0] = [Math.max(0, cx - Math.round(0.15 * W)), Math.max(0, cy - Math.round(0.045 * H))];
  const [x1, y1] = [Math.min(W, cx + Math.round(0.15 * W)), Math.min(H, cy + Math.round(0.045 * H))];
  const [w, h] = [x1 - x0, y1 - y0];
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = ink(x + x0, y + y0) ? 1 : 0;
  const reach = 6;
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x])
        for (let yy = Math.max(0, y - reach); yy <= Math.min(h - 1, y + reach); yy++)
          for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx++) near[yy * w + xx] = 1;
  // Start from the letter nearest the point; vertical distance counts double, as names run sideways.
  let start = -1;
  let best = Infinity;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const d = ((i % w) + x0 - cx) ** 2 + ((Math.floor(i / w) + y0 - cy) * 2) ** 2;
    if (d < best) [best, start] = [d, i];
  }
  if (start < 0) throw new Error(`No lettering found near ${village.slug}`);
  const seen = new Uint8Array(w * h);
  const queue = [start];
  seen[start] = 1;
  let [bx0, by0, bx1, by1] = [w, h, 0, 0];
  while (queue.length) {
    const i = queue.pop();
    const [x, y] = [i % w, Math.floor(i / w)];
    if (mask[i]) [bx0, by0, bx1, by1] = [Math.min(bx0, x), Math.min(by0, y), Math.max(bx1, x), Math.max(by1, y)];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * w + nx;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && !seen[n] && near[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  return {
    box: [bx0 + x0, by0 + y0, bx1 + x0 + 1, by1 + y0 + 1],
    letter: (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 && mask[(y - y0) * w + (x - x0)] === 1 && seen[(y - y0) * w + (x - x0)] === 1,
  };
}
function callout(slug) {
  const [x0, y0, x1, y1] = CALLOUTS[slug];
  const box = [Math.floor(x0 * W), Math.floor(y0 * H), Math.ceil(x1 * W), Math.ceil(y1 * H)];
  return { box, letter: (x, y) => x >= box[0] && x < box[2] && y >= box[1] && y < box[3] && cream(x, y) };
}

// The letters, on a grid of picture units (the puzzle's own 509 × 640): a unit holds a letter when
// at least two of its pixels do. Stored as a hex bitmask over the units the box covers, row by row.
const [PW, PH] = [509, 640];
function letters({ box, letter }) {
  const [ux0, uy0] = [Math.floor((box[0] * PW) / W), Math.floor((box[1] * PH) / H)];
  const [ux1, uy1] = [Math.ceil((box[2] * PW) / W), Math.ceil((box[3] * PH) / H)];
  const bits = [];
  for (let uy = uy0; uy < uy1; uy++)
    for (let ux = ux0; ux < ux1; ux++) {
      let count = 0;
      for (let y = Math.floor((uy * H) / PH); y < Math.ceil(((uy + 1) * H) / PH); y++) for (let x = Math.floor((ux * W) / PW); x < Math.ceil(((ux + 1) * W) / PW); x++) count += letter(x, y) ? 1 : 0;
      bits.push(count >= 2 ? 1 : 0);
    }
  while (bits.length % 4) bits.push(0);
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  return { x: ux0, y: uy0, w: ux1 - ux0, h: uy1 - uy0, bits: hex };
}

const round = (v) => Math.round(v * 10000) / 10000;
const labels = villages.map((village) => {
  const found = village.slug in CALLOUTS ? callout(village.slug) : label(village);
  return { slug: village.slug, box: [round(found.box[0] / W), round(found.box[1] / H), round(found.box[2] / W), round(found.box[3] / H)], ink: letters(found) };
});
writeFileSync("src/puzzle/villageLabels.ts", `// Generated by scripts/build-village-labels.mjs from the Guåhan map. Do not edit by hand.
// Where each village's name is lettered. \`box\`: fractions of the picture, [left, top, right, bottom].
// \`ink\`: which picture units (the puzzle's 509 × 640) hold its letters, as a hex bitmask over the
// w × h units from (x, y), row by row.
export interface VillageLabel {
  box: readonly [number, number, number, number];
  ink: { x: number; y: number; w: number; h: number; bits: string };
}
export const VILLAGE_LABELS: Record<string, VillageLabel> = {
${labels.map(({ slug, box, ink: i }) => `  ${JSON.stringify(slug)}: { box: [${box.join(", ")}], ink: { x: ${i.x}, y: ${i.y}, w: ${i.w}, h: ${i.h}, bits: "${i.bits}" } },`).join("\n")}
};
`);
console.log(labels.map(({ slug, box, ink: i }) => `${slug}: ${box.join(", ")} (${i.w} x ${i.h} units)`).join("\n"));
