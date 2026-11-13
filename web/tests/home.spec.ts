import { test, expect, type Page } from "@playwright/test";

const states = ["upcoming", "coming_soon", "live", "sold_out", "closed"] as const;
async function open(page: Page, path = "/", state = "upcoming") {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}mockDrop=${state}`);
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByText("Loading the collection…")).toHaveCount(0);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const trackX = (page: Page) => page.locator(".mission-track").evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

for (const state of states) {
  test(`home ${state}: the first screen says what the brand is and shows a puzzle`, async ({ page }, info) => {
    await open(page, "/", state);
    const h1 = page.getByRole("heading", { name: "A piece of home.", exact: true });
    await expect(h1).toBeInViewport();
    const mission = page.locator(".home-mission");
    await expect(mission).toHaveText("Keeping us connected to where we come from.");
    await expect(mission).toBeInViewport();
    const art = page.locator(".home-hero-art img");
    await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = (await art.boundingBox())!;
    const shop = page.getByRole("link", { name: "SHOP THE COLLECTION" });
    await expect(shop).toBeInViewport();
    if (info.project.name === "mobile") {
      // The photo, not just its top edge, is on the phone's first screen.
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      expect(box.width).toBe(358);
    } else {
      const copy = (await page.locator(".home-hero-copy").boundingBox())!;
      expect(box.x).toBeGreaterThan(copy.x + copy.width - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
    }
    expect(await overflow(page)).toBe(true);
  });
}

test("home with no drop at all has no drop section or drop language", async ({ page }) => {
  await open(page, "/", "closed");
  await expect(page.locator(".home-drop")).toHaveCount(0);
  await expect(page.locator(".home-hero").getByRole("button", { name: "NOTIFY ME" }).or(page.getByRole("link", { name: "SHOP THE DROP" }))).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "New drops, first." })).toBeVisible();
});

test("home coming soon: anticipatory, no date, quantity or price, and the signup is the action", async ({ page }) => {
  await open(page, "/", "coming_soon");
  const section = page.locator(".home-drop");
  await expect(section).toContainText("DROP 001 · COMING SOON");
  await expect(section).toContainText("The release date goes to the list first.");
  await expect(section).not.toContainText(/ChST|\d+ made|\$\d/);
  await expect(section.getByLabel("Email for drop alerts")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New drops, first." })).toHaveCount(0);
  // The hero's secondary action opens the alert signup in place: the page doesn't move.
  await page.getByRole("button", { name: "NOTIFY ME", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Get notified" });
  await expect(dialog.getByRole("heading", { name: "Guåhan Sunset Map" })).toBeVisible();
  await expect(dialog.getByLabel("Email for drop alerts")).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await dialog.getByLabel("Email for drop alerts").fill("hero@example.com");
  await dialog.getByRole("button", { name: "NOTIFY ME", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("You’re on the list. We’ll keep you posted.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".home-hero").getByRole("button", { name: "NOTIFY ME", exact: true })).toBeFocused();
  await section.getByLabel("Email for drop alerts").fill("soon@example.com");
  await section.getByRole("button", { name: "NOTIFY ME", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("You’re on the list. We’ll keep you posted.");
});

test("home upcoming with a date: Guam time first, quantity, and the signup", async ({ page }) => {
  await open(page, "/", "upcoming");
  const section = page.locator(".home-drop");
  await expect(section).toContainText("Drop 001 · Releases Sat, Dec 5 · 10:00 AM ChST · 100 made");
  await expect(section.getByRole("button", { name: "NOTIFY ME", exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: "VIEW THE DROP" })).toHaveAttribute("href", "/drop");
});

test("home live: the drop is a click away and the general list stays", async ({ page }) => {
  await open(page, "/", "live");
  await expect(page.locator(".home-drop")).toContainText("Drop 001 · Available now · 100 made");
  await page.getByRole("link", { name: "SHOP THE DROP", exact: true }).click();
  await expect(page).toHaveURL(/\/drop$/);
});

test("story section carries the secondary tagline", async ({ page }) => {
  await open(page);
  await expect(page.locator(".home-story")).toContainText("Grounded by land, guided by sea.");
});

test("mission strip moves, can be paused and resumed, and is not a tab stop", async ({ page }) => {
  await open(page);
  const strip = page.locator(".mission-marquee");
  await expect(strip).not.toHaveAttribute("tabindex");
  await expect(strip.locator('.mission-track-copy[aria-hidden="true"]')).toHaveCount(1);
  const toggle = strip.getByRole("button", { name: "Pause the moving mission text" });
  const size = (await toggle.boundingBox())!;
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  const first = await trackX(page);
  await expect.poll(() => trackX(page)).not.toBe(first);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Let the paused state reach the compositor before sampling; a busy renderer can lag a frame or two.
  await page.waitForTimeout(250);
  const held = await trackX(page);
  await page.waitForTimeout(500);
  expect(await trackX(page)).toBe(held);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => trackX(page)).not.toBe(held);
});

test("the logo is served at its displayed size, not as the 960px original", async ({ page }) => {
  await open(page, "/story");
  for (const [selector, width] of [[".story-emblem img", 200], ["footer img", 112]] as const) {
    const img = page.locator(selector).first();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/logo-emblem-(240|480)\.webp$/);
    expect((await img.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width >= 900 && selector !== "footer img" ? 320 : width);
  }
});

test("a ?look= link from the preview period is ignored", async ({ page }) => {
  for (const value of ["1", "2", "5", "off"]) {
    await open(page, `/?look=${value}`);
    await expect(page.locator("html")).not.toHaveAttribute("data-look");
    await expect(page.getByRole("navigation", { name: "Design preview" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A piece of home.", exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => sessionStorage.getItem("tyt-preview-look"))).toBeNull();
});

test("browser chrome colour matches the page", async ({ page }) => {
  await open(page);
  const theme = await page.locator('meta[name="theme-color"]').getAttribute("content");
  const paper = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  const rgb = theme!.match(/[0-9a-f]{2}/gi)!.map((hex) => parseInt(hex, 16));
  expect(paper).toBe(`rgb(${rgb.join(", ")})`);
});

test("the loading skeleton uses the hero grid, so the page does not jump when data arrives", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input instanceof Request ? input.url : input).includes("/storefront")) await new Promise((resolve) => setTimeout(resolve, 800));
      return original(input, init);
    };
  });
  await page.goto("/?mockDrop=upcoming");
  const skeleton = page.locator(".loading-home .home-hero");
  await expect(skeleton).toBeVisible();
  const before = (await skeleton.locator(".home-hero-art").boundingBox())!;
  await expect(page.getByRole("heading", { name: "A piece of home.", exact: true })).toBeVisible();
  const after = (await page.locator(".home-hero-art").boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
});
