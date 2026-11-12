// Usage: node scripts/build-box-placeholders.mjs   (run from web/; needs Playwright's Chromium and ImageMagick)
// Draws stand-in box faces for the spinnable box from the artwork already on the site, in the
// storefront's own tokens. They hold the place until Christian's real box art is uploaded in the admin.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const file = (path) => pathToFileURL(resolve(path)).href;
const font = (subset) => file(`node_modules/@fontsource-variable/archivo/files/archivo-${subset}-wght-normal.woff2`);
const wordmark = file("public/images/brand/wordmark-ink-720.webp");

const boxes = [
  { slug: "hafa-adai-from-tumon-bay", name: "Håfa Adai from Tumon Bay", line: "100 PIECE PUZZLE", art: "finished-flat-1280.webp", width: 1280, height: 960, depth: 192 },
  // The map's piece count isn't confirmed, so its box doesn't state one.
  { slug: "guahan-sunset-map", name: "Guåhan Sunset Map", line: "DROP 001", art: "artwork-1280.webp", width: 1024, height: 1280, depth: 192 },
];

const base = `
  @font-face { font-family: Archivo; src: url(${font("latin")}) format("woff2"); font-weight: 100 900; unicode-range: U+0000-00FF; }
  @font-face { font-family: Archivo; src: url(${font("latin-ext")}) format("woff2"); font-weight: 100 900; unicode-range: U+0100-02FF; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body { font-family: Archivo, sans-serif; color: #491e0b; display: flex; flex-direction: column; }
  .label { font-size: 22px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .mark { display: block; height: auto; }
  /* The wordmark file is ink; on the dark faces it is flattened to cream-white. */
  .dark .mark { filter: brightness(0) invert(0.96); }
`;
const page = (css, body, tone = "") => `<!doctype html><meta charset="utf-8"><style>${base}${css}</style><body class="${tone}">${body}`;

function faces(box) {
  const art = file(`public/images/products/${box.slug}/${box.art}`);
  const front = page(`
    body { background: #f2ede3; padding: 56px; gap: 40px; }
    header, footer { display: flex; justify-content: space-between; align-items: center; gap: 32px; }
    .mark { width: 300px; }
    .art { flex: 1; min-height: 0; background: url(${art}) center / contain no-repeat; }
    h1 { font-size: 64px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
  `, `<header><img class="mark" src="${wordmark}" alt=""><p class="label">${box.line}</p></header><div class="art"></div>
     <footer><h1>${box.name}</h1><p class="label">A piece of home.</p></footer>`);
  const back = page(`
    body { background: #491e0b; color: #fdefd5; padding: 72px; gap: 48px; justify-content: space-between; }
    .mark { width: 340px; }
    h1 { font-size: 76px; font-weight: 800; letter-spacing: -0.04em; line-height: 1.02; }
    .story { font-size: 30px; line-height: 1.45; max-width: 24em; margin-top: 32px; }
    .row { display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; }
    .thumb { width: 300px; aspect-ratio: 4 / 3; background: url(${art}) center / cover no-repeat; border: 6px solid #fdefd5; }
  `, `<img class="mark" src="${wordmark}" alt=""><div><h1>Tåno is land.<br>Tåsi is sea.</h1>
     <p class="story">Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are.</p></div>
     <div class="row"><div><p class="label">${box.name}</p><p class="label" style="margin-top:12px">Guåhan · Mariana Islands</p></div><div class="thumb"></div></div>`, "dark");
  // A side is drawn lying down, then turned, so its type reads up the spine.
  const side = (text) => page(`
    body { background: #14492b; color: #fdefd5; }
    .spine { width: ${box.height}px; height: ${box.depth}px; padding: 0 56px; display: flex; align-items: center; justify-content: space-between;
      transform-origin: top left; transform: translateY(${box.height}px) rotate(-90deg); }
    .mark { width: 260px; }
  `, `<div class="spine"><img class="mark" src="${wordmark}" alt=""><p class="label">${text}</p></div>`, "dark");
  return { front, back, left: side(box.name), right: side("A piece of home.") };
}

const scratch = mkdtempSync(join(tmpdir(), "box-faces-"));
const browser = await chromium.launch();
try {
  for (const box of boxes) {
    for (const [face, html] of Object.entries(faces(box))) {
      const narrow = face === "left" || face === "right";
      const width = narrow ? box.depth : box.width;
      const tab = await browser.newPage({ viewport: { width, height: box.height } });
      const source = join(scratch, `${box.slug}-${face}.html`);
      writeFileSync(source, html);
      await tab.goto(pathToFileURL(source).href);
      await tab.evaluate("document.fonts.ready.then(() => true)");
      const shot = join(scratch, `${box.slug}-${face}.png`);
      await tab.screenshot({ path: shot });
      await tab.close();
      for (const size of [width / 2, width]) {
        execFileSync("magick", [shot, "-resize", `${size}x`, "-quality", "86", `public/images/products/${box.slug}/box-placeholder-${face}-${size}.webp`]);
      }
    }
  }
} finally {
  await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}
