import { test, expect, type Page } from "@playwright/test";

const turn = (page: Page) => page.locator(".spin-box-body").first().evaluate((el: HTMLElement) => Number(/rotateY\((-?[\d.]+)deg\)/.exec(el.style.transform)?.[1]));
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy = 0) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx * i / 10, y: from.y + dy * i / 10, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
}
async function centre(page: Page) {
  const box = (await page.locator(".spin-box-stage").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a mouse spins the box on hover and it comes to rest facing front", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Hover is a mouse behaviour.");
  await page.goto("/shop");
  const stage = page.locator(".spin-box-stage").first();
  await expect(stage).toBeVisible();
  expect(await turn(page)).toBe(-24);
  await stage.hover();
  await expect.poll(() => turn(page)).toBeGreaterThan(20);
  await page.mouse.move(2, 400);
  await expect.poll(async () => (((await turn(page)) + 24) % 360 + 360) % 360).toBe(0);
});

test("reduced motion keeps the box still under the mouse", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Hover is a mouse behaviour.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/shop");
  await page.locator(".spin-box-stage").first().hover();
  await page.waitForTimeout(400);
  expect(await turn(page)).toBe(-24);
});

test("turning reduced motion on stops a spin that is already running", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Hover is a mouse behaviour.");
  await page.goto("/shop");
  await page.locator(".spin-box-stage").first().hover();
  await expect.poll(() => turn(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (((await turn(page)) + 24) % 360 + 360) % 360).toBe(0);
  const rest = await turn(page);
  await page.waitForTimeout(300);
  expect(await turn(page)).toBe(rest);
});

test("a mouse drags a card's box round without dragging the link or opening the product", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Mouse drag.");
  await page.goto("/shop");
  const at = await centre(page);
  await page.mouse.move(at.x - 100, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 150, at.y, { steps: 8 });
  // Mid-drag the box follows the pointer rather than spinning by itself.
  const held = await turn(page);
  await page.waitForTimeout(200);
  expect(await turn(page)).toBe(held);
  await page.mouse.up();
  await expect.poll(async () => (((await turn(page)) + 24) % 180 + 180) % 180).toBe(0);
  await expect(page).toHaveURL(/\/shop$/);
  // A plain click still opens the product.
  await page.mouse.move(2, 400);
  await page.locator(".spin-box-stage").first().click();
  await expect(page).toHaveURL(/\/products\//);
});

test("a press released outside the box doesn't leave it dragging", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Mouse drag.");
  await page.goto("/shop");
  const at = await centre(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 500, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (((await turn(page)) + 24) % 360 + 360) % 360).toBe(0);
  const rest = await turn(page);
  await page.mouse.move(at.x + 80, at.y + 500);
  expect(await turn(page)).toBe(rest);
  await expect(page).toHaveURL(/\/shop$/);
});

test("a finger drags a card's box round without opening the product or blocking the page scroll", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch drag.");
  await page.goto("/shop");
  await expect(page.locator(".spin-box-stage").first()).toBeVisible();
  // Let the one-time hint turn finish.
  await expect.poll(() => turn(page), { timeout: 4000 }).toBe(-24);
  await page.waitForTimeout(900);
  await swipe(page, await centre(page), 220);
  await expect.poll(() => turn(page)).toBe(156);
  await expect(page).toHaveURL(/\/shop$/);
  await swipe(page, await centre(page), 0, -200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
});

test("the product page leads with the box, turned by its button, and a swipe still moves the gallery", async ({ page }, testInfo) => {
  await page.goto("/products/hafa-adai-from-tumon-bay");
  await expect(page.getByRole("img", { name: "Front of the Håfa Adai from Tumon Bay puzzle box." })).toBeVisible();
  await page.getByRole("button", { name: "SHOW THE BACK" }).click();
  await expect(page.getByRole("button", { name: "SHOW THE FRONT" })).toBeVisible();
  expect(await turn(page)).toBe(156);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name !== "mobile") return;
  await expect(page.getByText("1 / 4")).toBeVisible();
  await swipe(page, await centre(page), -220);
  await expect(page.getByText("2 / 4")).toBeVisible();
  expect(await turn(page)).toBe(156);
});
