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
  const land = Number(await hero(page).getAttribute("data-placed"));
  expect(land).toBeGreaterThan(0);
  expect(land).toBeLessThan(30);
  await scrollThrough(page, 0.7);
  await expect(activeChapter(page)).toHaveText("Tåsi is sea.");
  expect(Number(await hero(page).getAttribute("data-placed"))).toBeGreaterThan(land);
  await scrollThrough(page, 1);
  await expect(hero(page)).toHaveAttribute("data-placed", "48");
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

test("choosing a village lifts its piece and leaves it outlined", async ({ page }) => {
  await open(page);
  const section = page.locator(".village-piece");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".village-piece-canvas")).toHaveAttribute("data-ready", "");
  const canvas = section.locator(".village-piece-canvas");
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
