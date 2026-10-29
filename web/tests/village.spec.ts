import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const evidence = process.env.VILLAGE_EVIDENCE_DIR;

test("village finder: whole island, north/central/south crops, reset and purchase order", async ({ page }, info) => {
  await page.goto("/drop?mockDrop=upcoming");
  const finder = page.getByRole("region", { name: "Find your village" });
  await expect(finder).toBeVisible();
  expect(await page.locator(".buy-controls").evaluate((buy) => {
    const finder = document.querySelector(".village-finder")!;
    return !!(buy.compareDocumentPosition(finder) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await finder.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const screenshot = async (name: string) => {
    if (!evidence) return;
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, `${info.project.name}-${name}.png`) });
    await finder.screenshot({ path: join(evidence, `${info.project.name}-${name}-finder.png`) });
    await page.screenshot({ path: join(evidence, `${info.project.name}-${name}-page.png`), fullPage: true });
  };
  await expect(finder.locator(".village-finder-map")).toHaveJSProperty("complete", true);
  await screenshot("default");
  const select = finder.getByRole("combobox", { name: "Choose a village" });
  if (evidence) {
    await select.selectOption("yigo");
    const start = Date.now();
    for (const offset of [0, 80, 160, 300, 450, 650]) {
      await page.waitForTimeout(Math.max(0, offset - (Date.now() - start)));
      await page.screenshot({ path: join(evidence, `${info.project.name}-zoom-${offset}.png`) });
    }
    await finder.getByRole("button", { name: "Whole island" }).click();
  }
  for (const [slug, name] of [["yigo", "Yigo"], ["hagatna", "Hagåtña"], ["malesso", "Malesso'"]]) {
    await select.focus();
    await select.selectOption(slug);
    const crop = finder.getByRole("img", { name: `${name} on the illustrated Guåhan map` });
    await expect(crop).toBeVisible();
    await expect(finder.locator(".village-finder-viewport")).toHaveAttribute("data-ready", "true");
    await expect.poll(() => crop.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(finder.getByRole("status")).toHaveText(`${name} on the Guåhan map.`);
    await expect(select).toBeFocused();
    await expect(crop).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(slug);
  }
  await finder.getByRole("button", { name: "Whole island" }).click();
  await expect(select).toHaveValue("");
  await expect(select).toBeFocused();
  await expect(finder.getByRole("status")).toHaveText("The whole island of Guåhan.");
  // The feature belongs to the map puzzle, never the core product.
  await page.goto("/products/hafa-adai-from-tumon-bay");
  await expect(page.getByRole("heading", { name: "Håfa Adai from Tumon Bay" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Find your village" })).toHaveCount(0);
});

test("village finder: rapid selection, reduced motion, crop failure and recovery", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/products/guahan-sunset-map?mockDrop=live");
  const finder = page.getByRole("region", { name: "Find your village" });
  await finder.scrollIntoViewIfNeeded();
  const select = finder.getByRole("combobox");
  await select.selectOption("yigo");
  await select.selectOption("malesso");
  await expect(finder.locator(".village-finder-viewport")).toHaveAttribute("data-village", "malesso");
  await expect(finder.locator(".village-finder-viewport")).toHaveAttribute("data-ready", "true");
  await expect(finder.locator(".village-finder-map")).toHaveCSS("transform", "none");
  await expect(finder.locator(".village-finder-crop")).toHaveCSS("transition-duration", "0.1s");
  // Offline mode also reaches images fetched through the fixture service worker.
  await page.context().setOffline(true);
  await select.selectOption("hagatna");
  await expect(finder.getByText("The detailed image couldn’t load.")).toBeVisible();
  await page.context().setOffline(false);
  await finder.getByRole("button", { name: "Try again" }).click();
  await expect(finder.locator(".village-finder-viewport")).toHaveAttribute("data-ready", "true");
  await expect(finder.getByText("The detailed image couldn’t load.")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
