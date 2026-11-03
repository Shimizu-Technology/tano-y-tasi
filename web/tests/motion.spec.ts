import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.use({ video: { mode: "on", size: { width: 390, height: 844 } } });

async function product(page: Page) {
  await page.goto("/products/hafa-adai-from-tumon-bay?mockDrop=upcoming");
  await expect(page.getByRole("heading", { name: "Håfa Adai from Tumon Bay" })).toBeVisible();
}
// Two taps through one CDP session so the gap stays well inside the 280 ms double-tap
// window even on a busy CI renderer (separate sessions per tap can exceed it).
async function doubleTap(page: Page, at: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  try {
    for (let i = 0; i < 2; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...at, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
  } finally { await cdp.detach(); }
}
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy = 0, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx * i / steps, y: from.y + dy * i / steps, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally { await cdp.detach(); }
}
test("overlay recovery: rapid exits retain focus, menu routes work, and the cart survives", async ({ page }, info) => {
  await product(page);
  const trigger = page.getByRole("button", { name: "CART (0)" });
  for (let i = 0; i < 3; i++) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Your cart" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  }
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "MENU", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Menu", exact: true });
    await menu.getByRole("link", { name: "SHOP", exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
  }
});
test("viewer: keyboard zoom, point zoom, pan, and image swap preserve its fixed layout", async ({ page }, info) => {
  await product(page);
  const opener = page.getByRole("button", { name: /View image 1 of/ });
  await opener.click();
  const viewer = page.getByRole("dialog", { name: "Artwork image viewer" });
  const canvas = viewer.locator(".viewer-canvas");
  const art = viewer.locator(".viewer-art");
  const layout = await art.evaluate((el) => [el.clientWidth, el.clientHeight]);
  const slider = viewer.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("1.1");
  await slider.fill("1");
  await canvas.dblclick({ position: { x: 100, y: 200 } });
  await expect(slider).toHaveValue("2.5");
  const before = await art.evaluate((el) => el.style.transform);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 110, box.y + 210);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 250, { steps: 4 });
  await page.mouse.up();
  expect(await art.evaluate((el) => el.style.transform)).not.toBe(before);
  expect(await art.evaluate((el) => [el.clientWidth, el.clientHeight])).toEqual(layout);
  await slider.fill("4");
  await expect(slider).toHaveValue("4");
  if (info.project.name === "mobile") {
    await slider.fill("1");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await doubleTap(page, point);
    await expect(slider).toHaveValue("2.5");
    await slider.fill("1");
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x - 40, y: point.y, id: 1 }, { x: point.x + 40, y: point.y, id: 2 }] });
      for (let distance = 50; distance <= 160; distance += 10) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x - distance, y: point.y, id: 1 }, { x: point.x + distance, y: point.y, id: 2 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(slider).toHaveValue("4");
      expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    } finally { await cdp.detach(); }
  }
  await viewer.getByRole("button", { name: "NEXT", exact: true }).click();
  await expect(slider).toHaveValue("1");
  await expect(art).toHaveCSS("transform", "none");
  await viewer.getByRole("button", { name: "CLOSE", exact: true }).click();
  await expect(viewer).toBeHidden();
  await expect(opener).toBeFocused();
});
test("reduced motion keeps fades, a static mission strip, working overlays and disclosures", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?mockDrop=live");
  await expect(page.getByRole("heading", { name: "A piece of home.", exact: true })).toBeVisible();
  await expect(page.locator(".mission-track")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".mission-track-copy")).toHaveCount(1);
  await expect(page.locator(".mission-toggle")).toHaveCount(0);
  await expect(page.locator(".live-dot").first()).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "CART (0)" }).click();
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await expect(dialog).toHaveCSS("transform", "none");
  await expect(dialog).toHaveCSS("transition-duration", "0.1s");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await product(page);
  const shipping = page.locator("details").filter({ has: page.getByText("Shipping", { exact: true }) });
  await shipping.locator("summary").click();
  await expect(shipping.getByText(/Shipping is calculated at checkout/)).toBeVisible();
  await shipping.locator("summary").click();
  await expect(shipping).not.toHaveAttribute("open");
});
test("the cart count ticks only after adding, never on load", async ({ page }) => {
  await page.goto("/?mockDrop=upcoming");
  await expect(page.getByRole("heading", { name: "A piece of home.", exact: true })).toBeVisible();
  expect(await page.locator(".cart-count").evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.getByRole("link", { name: "VIEW DETAILS", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Håfa Adai from Tumon Bay" })).toBeVisible();
  // Capture the count's WAAPI tick even if it completes before Playwright's next call.
  await page.evaluate(() => {
    const el = document.querySelector(".cart-count")!;
    el.animate = new Proxy(el.animate, { apply(target, thisArg, args) {
      el.setAttribute("data-tick", JSON.stringify(args));
      return Reflect.apply(target, thisArg, args);
    } });
  });
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await expect(page.locator(".cart-count")).toHaveAttribute("data-tick", /scale\(1.15\)/);
});

test.describe("motion recordings", () => {
  test.beforeEach(async ({ browserName }, info) => { test.skip(browserName !== "chromium" || info.project.name !== "mobile", "Phone-only motion evidence"); });
  test("cart open and close recording", async ({ page }, info) => {
    await product(page);
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForTimeout(250);
    // Sample every animation frame as well as recording video (25 fps).
    const frames = await page.evaluate(async () => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
      const sample = async (duration: number) => {
        const frames = [];
        const start = performance.now();
        while (performance.now() - start < duration) {
          await new Promise(requestAnimationFrame);
          const el = document.querySelector<HTMLDialogElement>(".cart-dialog");
          frames.push({ t: performance.now() - start, present: !!el, x: el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m41 : null,
            duration: el ? getComputedStyle(el).transitionDuration : null, backdrop: el ? getComputedStyle(el, "::backdrop").opacity : null });
        }
        return frames;
      };
      trigger.focus();
      trigger.click();
      const enter = await sample(300);
      const dialog = document.querySelector<HTMLDialogElement>(".cart-dialog")!;
      // Wait for the drawer to settle on its own clock (a busy renderer may need longer than the sample).
      const settleStart = performance.now();
      while (new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m41 !== 0 && performance.now() - settleStart < 3000) {
        await new Promise(requestAnimationFrame);
      }
      const settledX = new DOMMatrixReadOnly(getComputedStyle(dialog).transform).m41;
      const enterDuration = getComputedStyle(dialog).transitionDuration;
      // Read the closing transition the moment the closing state is applied, independent of frame timing.
      const closing = new Promise<string>((resolve) => {
        const observer = new MutationObserver(() => {
          if (dialog.dataset.state !== "closing") return;
          observer.disconnect();
          resolve(getComputedStyle(dialog).transitionDuration);
        });
        observer.observe(dialog, { attributes: true, attributeFilter: ["data-state"] });
      });
      document.querySelector<HTMLButtonElement>(".cart-dialog .drawer-header button")!.click();
      const exitDuration = await closing;
      const exit = await sample(230);
      return { enter, exit, enterDuration, exitDuration, settledX };
    });
    const path = info.outputPath("cart-animation-frames.json");
    await writeFile(path, JSON.stringify(frames, null, 2));
    await info.attach("cart-animation-frames", { path, contentType: "application/json" });
    // The sampled frames are evidence only; a busy CI renderer may skip every intermediate frame.
    expect(frames.enterDuration.split(", ")).toContain("0.22s");
    expect(frames.exitDuration.split(", ").every((duration) => duration === "0.16s")).toBe(true);
    expect(frames.settledX).toBe(0);
    await expect(page.locator(".cart-dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "CART (0)" })).toBeFocused();
    await page.waitForTimeout(200);
  });
  test("cart swipe recording", async ({ page }) => {
    await product(page);
    await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Your cart" });
    await expect(dialog.getByText("$35", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    // Native touch dispatch exercises pan-y and real pointer capture.
    await swipe(page, { x: 160, y: 35 }, -60);
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);
    await swipe(page, { x: 90, y: 35 }, 210);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await page.getByRole("button", { name: "CART (1)" }).click();
    await expect(dialog.getByText("Håfa Adai from Tumon Bay", { exact: true })).toBeVisible();
    await page.waitForTimeout(250);
  });
});
