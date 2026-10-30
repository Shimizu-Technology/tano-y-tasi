import { test, expect, type Page } from "@playwright/test";
async function home(page: Page) {
  await page.goto("/?look=5");
  await expect(page.locator(".sunhill-identity h1")).toHaveText("A piece of home.");
}
test("Look 5 hero leads with the live village map: select, reset and reload", async ({ page }) => {
  await home(page);
  const hero = page.locator(".look5-map-hero");
  const finder = hero.locator("#find-your-village");
  // The map replaces Look 4's photo and loads eagerly as hero content.
  await expect(hero.locator(".village-finder-map")).toHaveAttribute("loading", "eager");
  await expect(hero.locator(".sunhill-art > img")).toHaveCount(0);
  await expect(page.locator(".village-teaser")).toHaveCount(0);
  await hero.getByLabel("Choose a village").selectOption("yigo");
  await expect(finder.locator('[data-village="yigo"]')).toHaveAttribute("data-ready", "true");
  await expect(finder.getByRole("status")).toHaveText("Yigo on the Guåhan map.");
  await finder.getByRole("button", { name: "Whole island", exact: true }).click();
  await expect(finder.getByRole("status")).toHaveText("The whole island of Guåhan.");
  await page.reload();
  await expect(page.locator(".look5-map-hero .village-finder-viewport")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-look", "5");
});
for (const surface of ["featured", "card", "grid"]) {
  test(`Look 5 ${surface} second view loads only for fine pointers`, async ({ page }, info) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("piece-detail-")) requests.push(request.url()); });
    await home(page);
    if (surface === "card") await page.goto("/archive");
    if (surface === "grid") await page.goto("/?look=5&mockCore=2");
    const link = page.locator(surface === "featured" ? ".feature-art" : surface === "grid" ? ".product-card" : ".archive-preview > a").first();
    const alt = link.locator(".second-view-alt");
    await link.scrollIntoViewIfNeeded();
    await expect(alt).toHaveCount(0);
    if (info.project.name === "mobile") {
      await link.focus();
      await expect(alt).toHaveCount(0);
      if (surface === "featured") expect(requests).toHaveLength(0);
      return;
    }
    await link.hover();
    await expect(alt).toHaveCSS("opacity", "1");
    await expect(alt).toHaveCSS("transition-duration", "0.18s");
    await expect(alt).toHaveCSS("transition-timing-function", "cubic-bezier(0.23, 1, 0.32, 1)");
    await expect(alt).toHaveCSS("transform", "none");
    await expect(link.locator(".second-view-main")).toHaveCSS("opacity", "0");
    await page.mouse.move(0, 0);
    await expect(alt).toHaveCSS("opacity", "0");
    await link.focus();
    await expect(alt).toHaveCSS("opacity", "1");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(alt).toHaveCSS("transition-duration", "0.1s");
  });
}
// Sample on the first commit so fast animations cannot finish before assertions.
test("Look 5 hero settles once and stays still on refetch, route return, reload and back", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { heroSamples: [] });
    new MutationObserver(() => {
      const items = [...document.querySelectorAll('.look5-entrance[data-enter="once"] > [data-enter-item]')];
      const samples = (window as unknown as { heroSamples: unknown[] }).heroSamples;
      if (items.length === 4 && !samples.length) samples.push({
        names: items.map((el) => getComputedStyle(el).animationName),
        durations: items.map((el) => getComputedStyle(el).animationDuration),
        delays: items.map((el) => getComputedStyle(el).animationDelay),
        from: (items[0].getAnimations()[0]?.effect as KeyframeEffect)?.getKeyframes()[0].transform,
      });
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-enter-item"] });
  });
  await home(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { heroSamples: unknown[] }).heroSamples[0])).toEqual({
    names: Array(4).fill("look5-settle"), durations: Array(4).fill("0.2s"), delays: ["0s", "0.045s", "0.09s", "0.135s"], from: "translateY(8px)",
  });
  await expect(page.locator(".look5-entrance")).not.toHaveAttribute("data-enter");
  // Age the query, then verify a real background response rather than only a focus event.
  await page.clock.install();
  await page.clock.fastForward(16_000);
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/v1/storefront"));
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(page.locator(".look5-entrance")).not.toHaveAttribute("data-enter");
  await page.locator(".look-hero-actions .button").click();
  await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".look5-entrance")).not.toHaveAttribute("data-enter");
  await page.reload();
  await expect(page.locator(".look5-entrance h1")).toBeVisible();
  await expect(page.locator(".look5-entrance [data-enter-item]")).toHaveCount(0);
});
test("Look 5 reduced motion uses short opacity entrance and static marquee", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const el = document.querySelector('.look5-entrance [data-enter-item]');
      if (el && !(window as unknown as { reducedHero?: unknown }).reducedHero) {
        const s = getComputedStyle(el);
        Object.assign(window, { reducedHero: { name: s.animationName, duration: s.animationDuration, transform: s.transform, delay: s.animationDelay } });
      }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-enter-item"] });
  });
  await home(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { reducedHero?: unknown }).reducedHero)).toEqual({ name: "look5-fade", duration: "0.1s", transform: "none", delay: "0s" });
  await expect(page.locator(".mission-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator('.mission-track-copy[aria-hidden="true"]')).toBeHidden();
  await expect(page.locator(".sunhill-identity h1")).toHaveCSS("opacity", "1");
});
test("Look 5 mission remains a 55 second linear loop and pauses on focus", async ({ page }) => {
  await home(page);
  await expect(page.locator(".mission-track")).toHaveCSS("animation-duration", "55s");
  await expect(page.locator(".mission-track")).toHaveCSS("animation-timing-function", "linear");
  await page.locator(".mission-marquee").focus();
  await expect(page.locator(".mission-track")).toHaveCSS("animation-play-state", "paused");
});


test("Look 5 preview links never overlap and retain 44px targets", async ({ page }) => {
  for (const width of [320, 390, 600, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await home(page);
    const bounds = await page.locator(".look-preview-bar a").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().toJSON()));
    for (const rect of bounds) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, `overlap at ${width}`).toBe(false);
    }
    await expect(page.getByRole("link", { name: "5 Motion", exact: true })).toHaveAttribute("aria-current", "true");
  }
});
