import { test, expect, type Page } from "@playwright/test";

// Runs against the puzzle-home build: playwright.puzzle.config.ts.
async function open(page: Page, state = "coming_soon") {
  await page.goto(`/?mockDrop=${state}`);
  await expect(page.locator("main h1").first()).toBeVisible();
}
const hero = (page: Page) => page.locator(".puzzle-hero");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// Scrolls to a share of the way through the pinned puzzle and waits for the drawing to catch up.
async function scrollThrough(page: Page, share: number) {
  await page.evaluate((p) => {
    const section = document.querySelector<HTMLElement>(".puzzle-hero")!;
    const sticky = document.querySelector<HTMLElement>(".puzzle-sticky")!;
    window.scrollTo(0, (section.offsetHeight - sticky.offsetHeight) * p);
  }, share);
  await page.waitForTimeout(600);
}
// How much of a layer is painted, as a share of its pixels.
const painted = (page: Page, layer: number) => page.locator(".puzzle-canvas canvas").nth(layer).evaluate((canvas: HTMLCanvasElement) => {
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let filled = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] > 0) filled++;
  return filled / (data.length / 16);
});
const activeChapter = (page: Page) => page.locator(".puzzle-chapter[data-active]");

test("the first screen says what the brand is, shows the map in pieces and the way to shop", async ({ page }, info) => {
  await open(page);
  await expect(hero(page)).toHaveAttribute("data-mode", "live");
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute("data-ready", "");
  const h1 = page.getByRole("heading", { name: "A piece of home.", exact: true });
  await expect(h1).toBeInViewport();
  await expect(page.getByText("Keeping us connected to where we come from.").first()).toBeInViewport();
  await expect(page.getByText(/Scroll to put Guåhan together/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "SHOP THE COLLECTION" }).first()).toBeInViewport();
  // The pile is drawn; nothing is placed or in the air yet.
  expect(await painted(page, 0)).toBeGreaterThan(0.3);
  expect(await painted(page, 1)).toBe(0);
  await expect(hero(page)).toHaveAttribute("data-placed", "0");
  // The pinned screen fits the viewport under the header, with no sideways scroll.
  const sticky = (await page.locator(".puzzle-sticky").boundingBox())!;
  expect(sticky.y).toBe(56);
  expect(sticky.height).toBe((info.project.name === "mobile" ? 844 : 900) - 56);
  expect(await overflow(page)).toBe(true);
});

test("scrolling puts the land together, then the sea, then the last piece, and the words follow", async ({ page }) => {
  await open(page);
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute("data-ready", "");
  await scrollThrough(page, 0.3);
  await expect(activeChapter(page)).toHaveText("Tåno is land.");
  const pieces = Number(await hero(page).getAttribute("data-pieces"));
  const land = Number(await hero(page).getAttribute("data-placed"));
  // Some of the island is in place; the sea isn't yet.
  expect(land).toBeGreaterThan(0);
  expect(land).toBeLessThan(pieces / 2);
  await scrollThrough(page, 0.7);
  await expect(activeChapter(page)).toHaveText("Tåsi is sea.");
  expect(Number(await hero(page).getAttribute("data-placed"))).toBeGreaterThan(land);
  await scrollThrough(page, 1);
  await expect(hero(page)).toHaveAttribute("data-placed", (await hero(page).getAttribute("data-pieces"))!);
  await expect(activeChapter(page)).toContainText("Guåhan Sunset Map");
  await expect(activeChapter(page)).toContainText("Drop 001 · Coming soon");
  // The pile is gone and the finished map is drawn.
  expect(await painted(page, 0)).toBe(0);
  expect(await painted(page, 1)).toBeGreaterThan(0.2);
  // Going back up returns pieces to the pile.
  await scrollThrough(page, 0.05);
  await expect(hero(page)).toHaveAttribute("data-placed", "0");
  await expect(activeChapter(page)).toContainText("A piece of home.");
});

test("past the puzzle the page carries on, and the pinned screen lets go", async ({ page }) => {
  await open(page);
  await scrollThrough(page, 1);
  await page.evaluate(() => window.scrollBy(0, innerHeight));
  await page.waitForTimeout(300);
  const sticky = (await page.locator(".puzzle-sticky").boundingBox())!;
  expect(sticky.y + sticky.height).toBeLessThan(56 + 10);
  await expect(page.getByRole("heading", { name: "The core collection" })).toBeVisible();
  await page.getByRole("heading", { name: "The core collection" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "The core collection" })).toBeInViewport();
});

test("with reduced motion it is the finished map, nothing pinned", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "upcoming");
  await expect(hero(page)).toHaveAttribute("data-mode", "still");
  await expect(page.locator(".puzzle-canvas")).toHaveCount(0);
  const art = page.locator(".puzzle-art");
  await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(art).toBeVisible();
  expect((await hero(page).boundingBox())!.height).toBeLessThan(info.project.name === "mobile" ? 844 : 900);
  await expect(page.getByText(/Scroll to put Guåhan together/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "SHOP THE COLLECTION" }).first()).toBeVisible();
  expect(await overflow(page)).toBe(true);
});

test("the hero's NOTIFY ME opens the drop alert in place", async ({ page }) => {
  await open(page, "upcoming");
  await scrollThrough(page, 0.5);
  const before = await page.evaluate(() => scrollY);
  await page.locator(".puzzle-actions").getByRole("button", { name: "NOTIFY ME" }).click();
  const dialog = page.getByRole("dialog", { name: "Get notified" });
  await expect(dialog.getByRole("heading", { name: "Guåhan Sunset Map" })).toBeVisible();
  await expect(dialog.getByLabel("Email for drop alerts")).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test("a browser that can't back the canvases gets the finished map, not an empty pinned screen", async ({ page }) => {
  // The capability check passes; every canvas after it gets no context, as when canvas memory runs out.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let calls = 0;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      calls += 1;
      return calls === 1 ? original.apply(this, args) : null;
    } as typeof original;
  });
  await open(page);
  await expect(hero(page)).toHaveAttribute("data-mode", "still");
  await expect(page.locator(".puzzle-canvas")).toHaveCount(0);
  await expect(page.locator(".puzzle-art")).toBeVisible();
  expect((await hero(page).boundingBox())!.height).toBeLessThan(944);
  await page.locator(".village-piece").scrollIntoViewIfNeeded();
  await expect(page.locator(".village-piece-canvas")).toHaveCount(0);
  await expect(page.locator(".village-piece-art")).toBeVisible();
});

test("a change of screen sharpness redraws the puzzle at the new resolution", async ({ page }, info) => {
  await open(page);
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute("data-ready", "");
  // The village puzzle's picture loads lazily; bring it in so both puzzles are drawn.
  await page.locator(".village-piece").scrollIntoViewIfNeeded();
  await expect(page.locator(".village-piece-canvas")).toHaveAttribute("data-ready", "");
  await page.evaluate(() => window.scrollTo(0, 0));
  const widths = () => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>(".puzzle-canvas canvas, .village-piece-canvas")].map((c) => c.width / c.getBoundingClientRect().width));
  await expect.poll(widths).toEqual([1, 1, 1, 1]);
  const viewport = page.viewportSize()!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 2, mobile: info.project.name === "mobile" });
  // Headless Chromium changes the ratio without the media query event a real screen change sends;
  // a zoom's resize is the other path the page watches.
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect.poll(widths).toEqual([2, 2, 2, 2]);
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute("data-ready", "");
});

test("scrolling away and back repaints the pile and the puzzle as a fresh drawing would", async ({ page }, info) => {
  await open(page);
  await expect(page.locator(".puzzle-canvas")).toHaveAttribute("data-ready", "");
  // The pile and the placed pieces repaint only around pieces that leave or join them. After a
  // long scroll history, the layers are kept, then a change of pixel ratio there and back makes
  // the page draw everything afresh at the same point, for comparison. The layers are compared
  // inside the page: they are too large to copy out.
  await scrollThrough(page, 0.3);
  for (const share of [0.6, 0.95, 1, 0.1, 0.5]) await scrollThrough(page, share);
  await scrollThrough(page, 0.3);
  await page.evaluate(() => {
    (window as unknown as { layers: Uint8ClampedArray[] }).layers = [...document.querySelectorAll<HTMLCanvasElement>(".puzzle-canvas canvas")].slice(0, 2).map((c) => c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data);
  });
  const cdp = await page.context().newCDPSession(page);
  const viewport = page.viewportSize()!;
  const mobile = info.project.name === "mobile";
  for (const deviceScaleFactor of [2, 1]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor, mobile });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect.poll(() => page.evaluate(() => document.querySelector("canvas")!.width / innerWidth)).toBe(deviceScaleFactor);
  }
  const [pile, placed] = await page.evaluate(() => {
    const kept = (window as unknown as { layers: Uint8ClampedArray[] }).layers;
    return [...document.querySelectorAll<HTMLCanvasElement>(".puzzle-canvas canvas")].slice(0, 2).map((c, layer) => {
      const fresh = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let changed = 0;
      let most = 0;
      for (let i = 0; i < fresh.length; i++) {
        const d = Math.abs(fresh[i] - kept[layer][i]);
        if (d) changed++;
        most = Math.max(most, d);
      }
      return { changed, most, of: fresh.length, painted: fresh.some((v, i) => i % 4 === 3 && v > 0) };
    });
  });
  // Both layers have pieces on them at this point, and the kept drawing matches the fresh one
  // within a shade at the edge of a repaint.
  expect([pile.painted, placed.painted]).toEqual([true, true]);
  for (const layer of [pile, placed]) {
    expect(layer.most).toBeLessThanOrEqual(32);
    expect(layer.changed).toBeLessThan(layer.of / 1000);
  }
});

test("a chosen village's piece is held up, larger than its slot, over its own place", async ({ page }) => {
  await page.clock.install();
  await open(page);
  const board = page.locator(".village-piece-board");
  await board.scrollIntoViewIfNeeded();
  await expect(page.locator(".village-piece-canvas")).toHaveAttribute("data-ready", "");
  const pixels = () => page.locator(".village-piece-canvas").evaluate((c: HTMLCanvasElement) => Array.from(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data));
  // Time stands still, so the lift can be caught at the top.
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.locator(".village-piece select").selectOption("hagat");
  await page.clock.runFor(420);
  const held = await pixels();
  await page.clock.runFor(1200);
  const settled = await pixels();
  const { width, height, x: boardX } = await page.locator(".village-piece-canvas").evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height, x: c.getBoundingClientRect().width }));
  const ratio = width / boardX;
  // Where the held and settled frames differ is the lifted piece and its shadow.
  let [x0, y0, x1, y1] = [width, height, 0, 0];
  for (let i = 0; i < held.length; i += 4) {
    if (Math.abs(held[i] - settled[i]) + Math.abs(held[i + 1] - settled[i + 1]) + Math.abs(held[i + 2] - settled[i + 2]) > 30) {
      const [x, y] = [(i / 4) % width, Math.floor(i / 4 / width)];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  const across = (x1 - x0) / ratio;
  const cell = boardX / 14;
  expect(across).toBeGreaterThan(Math.max(56, cell * 1.5));
  expect(across).toBeLessThan(160);
  // Hågat's name is under the lifted piece.
  const [vx, vy] = [0.2192 * width, 0.6368 * height];
  expect(vx).toBeGreaterThan(x0);
  expect(vx).toBeLessThan(x1);
  expect(vy).toBeGreaterThan(y0);
  expect(vy).toBeLessThan(y1);
});

test("choosing a village lifts its piece and leaves it outlined", async ({ page }) => {
  await open(page);
  const section = page.locator(".village-piece");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".village-piece-canvas")).toHaveAttribute("data-ready", "");
  const canvas = section.locator(".village-piece-canvas");
  // The canvas covers the picture beneath it completely, so a lifted piece leaves an empty slot.
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
    return true;
  })).toBe(true);
  const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const whole = await pixels();
  await section.getByLabel("Choose a village").selectOption("hagat");
  await expect(section).toHaveAttribute("data-village", "hagat");
  await expect(section.getByRole("status")).toHaveText("Hågat on the Guåhan map.");
  await page.waitForTimeout(1100);
  const settled = await pixels();
  expect(settled).not.toBe(whole);
  await section.getByLabel("Choose a village").selectOption("");
  await expect(section.getByRole("status")).toHaveText("The whole island of Guåhan.");
  await expect.poll(pixels).toBe(whole);
});
