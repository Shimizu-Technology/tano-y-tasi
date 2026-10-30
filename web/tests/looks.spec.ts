import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const output = process.env.LOOK_SCREENSHOT_DIR;
async function ready(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(async () => {
    document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((image) => { image.loading = "eager"; });
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function shot(page: Page, name: string, fullPage = true) {
  if (!output) return;
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage, animations: "disabled" });
}
for (const look of ["off", "1", "2", "3", "4", "5"]) {
  test(`look ${look}: browse, cart, menu, persistence, and unchanged metadata`, async ({ page }, info) => {
    const prefix = `${info.project.name}-${look === "off" ? "default" : `look-${look}`}`;
    await page.goto(`/?look=${look}`);
    await ready(page);
    if (look === "off") await expect(page.locator("html")).not.toHaveAttribute("data-look");
    else await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await expect(page.getByRole("navigation", { name: "Design preview" })).toHaveCount(look === "off" ? 0 : 1);
    await expect(page).toHaveTitle("A Piece of Home. — Tåno + Tåsi");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Premium puzzles of Guåhan. A piece of home, wherever you are.");
    for (const link of await page.getByRole("navigation", { name: "Design preview" }).getByRole("link").all()) {
      const bounds = await link.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `${prefix}-home`);
    if (info.project.name === "mobile") {
      await page.getByRole("button", { name: "MENU", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu).toBeVisible();
      await shot(page, `${prefix}-menu`, false);
      await menu.getByRole("link", { name: "SHOP", exact: true }).click();
      await expect(menu).toBeHidden();
    } else {
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "SHOP", exact: true }).click();
    }
    await ready(page);
    if (look === "off") await expect(page.locator("html")).not.toHaveAttribute("data-look");
    else await expect(page.locator("html")).toHaveAttribute("data-look", look);
    await page.getByRole("link", { name: "VIEW PUZZLE", exact: true }).click();
    await ready(page);
    await shot(page, `${prefix}-product`);
    await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
    const cart = page.getByRole("dialog", { name: "Your cart" });
    await expect(cart).toBeVisible();
    await expect(cart.getByText("$35", { exact: true })).toHaveCount(2);
    await shot(page, `${prefix}-cart`, false);
    await cart.getByRole("button", { name: "CLOSE", exact: true }).click();
    await expect(cart).toBeHidden();
    await page.goto("/drop");
    await ready(page);
    await expect(page.getByRole("button", { name: "RELEASES DEC 5", exact: true })).toBeDisabled();
    await shot(page, `${prefix}-drop`);
    await page.reload();
    await ready(page);
    if (look === "off") await expect(page.locator("html")).not.toHaveAttribute("data-look");
    else await expect(page.locator("html")).toHaveAttribute("data-look", look);
  });
}
test("switches and exits on the current URL without losing the cart", async ({ page }) => {
  await page.goto("/products/hafa-adai-from-tumon-bay?look=1");
  await ready(page);
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.getByRole("link", { name: "Look 2 Sun & Hill" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-look", "2");
  await expect(page).toHaveURL(/\/products\/hafa-adai-from-tumon-bay\?look=2/);
  await expect(page.getByRole("button", { name: "CART (1)" })).toBeVisible();
  await page.getByRole("link", { name: "Exit", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-look");
  await expect(page.getByRole("navigation", { name: "Design preview" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CART (1)" })).toBeVisible();
});
test("marquee moves, pauses for focus, and becomes static for reduced motion", async ({ page }) => {
  await page.goto("/?look=2");
  await ready(page);
  const track = page.locator(".mission-track");
  await expect(track).toHaveCSS("animation-name", "mission-scroll");
  const start = await track.evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => track.evaluate((element) => getComputedStyle(element).transform)).not.toBe(start);
  await page.locator(".mission-marquee").focus();
  await expect(track).toHaveCSS("animation-play-state", "paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("animation-name", "none");
  await expect(track).toHaveCSS("transform", "none");
  await expect(page.locator('.mission-track-copy[aria-hidden="true"]')).toBeHidden();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.evaluate(() => innerWidth));
});
test("admin is unaffected even with a saved look and preview parameter", async ({ page }) => {
  await page.goto("/?look=1");
  await ready(page);
  await page.goto("/admin?look=2");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-look");
  await expect(page.getByRole("navigation", { name: "Design preview" })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("tyt-preview-look"))).toBe("1");
});
for (const look of ["1", "2", "3", "4", "5"]) {
  test(`look ${look}: story, archive, signup, and simulated paid checkout retain the look`, async ({ page }) => {
    await page.goto(`/?look=${look}`);
    await ready(page);
    await page.getByLabel("Email for drop alerts").fill(`look-${look}@example.com`);
    await page.getByRole("button", { name: "SIGN UP", exact: true }).click();
    await expect(page.locator(".signup").getByRole("status")).toHaveText("You’re on the list. We’ll keep you posted.");
    await page.getByRole("link", { name: "Our story", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("heading", { name: "Tåno. Tåsi." })).toBeVisible();
    await page.goto("/archive");
    await ready(page);
    await page.getByRole("link", { name: "Meet Drop 001", exact: true }).click();
    await ready(page);
    await expect(page.getByRole("button", { name: "RELEASES DEC 5", exact: true })).toBeDisabled();
    await page.goto("/products/hafa-adai-from-tumon-bay");
    await ready(page);
    await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
    await page.getByLabel("Email address", { exact: true }).fill(`checkout-look-${look}@example.com`);
    await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
    await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
    await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Paid");
    await expect(page.getByRole("button", { name: "CART (0)" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("Paid");
    await expect(page.locator("html")).toHaveAttribute("data-look", look);
  });
}
