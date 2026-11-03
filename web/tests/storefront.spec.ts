import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function shot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await Promise.all(['400 16px', '600 24px', '800 expanded 40px', '900 expanded 24px'].map((style) =>
      document.fonts.load(`${style} "Archivo Variable"`, "GUÅHAN Håfa Adai")
    ));
    await document.fonts.ready;
  });
  if (await page.locator("main img").count()) await page.locator("main img").first().waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((i) => i.checkVisibility() && (i.loading !== "lazy" || i.getBoundingClientRect().top < innerHeight))
        .map((i) => i.decode().catch(() => {}))
    );
  });
  expect(await page.evaluate(() => [...document.fonts].some((face) =>
    face.family === "Archivo Variable" && face.status === "loaded" && face.stretch === "62% 125%"
  ))).toBe(true);
  await mkdir(".screenshots", { recursive: true });
  await page.screenshot({
    path: `.screenshots/${info.project.name}-${name}.png`,
    fullPage: !["cart", "menu"].includes(name),
    animations: "disabled",
  });
}
async function go(page: Page, path: string, state = "upcoming") {
  await page.goto(`${path}${path.includes("?") ? "&" : "?"}mockDrop=${state}`);
  await expect(page.getByText("Loading the collection…")).toHaveCount(0);
  await expect(page.locator("main h1").first()).toBeVisible();
}
async function overflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function addCore(page: Page) {
  await go(page, "/products/hafa-adai-from-tumon-bay");
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
}
async function checkout(page: Page, email = "qa@example.com") {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
}
test("home upcoming: hero, collection and island identity", async ({ page }, info) => {
  await go(page, "/");
  await expect(page.getByRole("heading", { name: "GUÅHAN", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "NOTIFY ME" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The core collection", exact: true })).toBeVisible();
  await shot(page, info, "home-upcoming");
  await overflow(page);
});
test("home live: direct path to the drop", async ({ page }, info) => {
  await go(page, "/", "live");
  await expect(page.getByRole("link", { name: "SHOP THE DROP", exact: true })).toBeVisible();
  await shot(page, info, "home-live");
  await overflow(page);
});
test("shop: core collection stays easy to find", async ({ page }, info) => {
  await go(page, "/shop");
  await expect(page.getByText("Håfa Adai from Tumon Bay", { exact: true })).toBeVisible();
  await shot(page, info, "shop");
  await overflow(page);
});
test("upcoming drop: Guam first, Pacific and Hawaii dates, disabled purchase", async ({ page }, info) => {
  await go(page, "/drop");
  await expect(page.getByText("Sat, Dec 5, 10:00 AM ChST", { exact: true })).toBeVisible();
  await expect(page.getByText(/Fri, Dec 4, 4:00 PM PT/)).toBeVisible();
  await expect(page.getByText(/Fri, Dec 4, 2:00 PM HT/)).toBeVisible();
  await expect(page.getByRole("button", { name: "RELEASES DEC 5" })).toBeDisabled();
  await shot(page, info, "drop-upcoming");
  await overflow(page);
});
test("live drop: limit two and cart recovery controls", async ({ page }, info) => {
  await go(page, "/drop", "live");
  await shot(page, info, "drop-live");
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(page.getByRole("button", { name: "Increase quantity", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText("2");
  await expect(dialog.getByRole("button", { name: /Increase quantity/ })).toBeDisabled();
  await expect(dialog.getByText("$90", { exact: true })).toBeVisible();
  await shot(page, info, "cart");
  await overflow(page);
});
test("sold-out drop: artwork and disabled action remain", async ({ page }, info) => {
  await go(page, "/drop", "sold_out");
  await expect(page.getByRole("button", { name: "SOLD OUT", exact: true })).toBeDisabled();
  await expect(page.getByText("Drop 001 sold out on Dec 5.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Only \d+ left/)).toHaveCount(0);
  await shot(page, info, "drop-sold-out");
  await overflow(page);
});
test("closed drop: no purchase and archived record", async ({ page }) => {
  await go(page, "/drop", "closed");
  await expect(page.getByRole("button", { name: "DROP CLOSED" })).toBeDisabled();
  await expect(page.getByText("This drop has closed.")).toBeVisible();
  await go(page, "/archive", "closed");
  await expect(page.getByText("Guåhan Sunset Map", { exact: true })).toBeVisible();
  await overflow(page);
});
test("product through checkout: paid confirmation survives reload", async ({ page }, info) => {
  await go(page, "/products/hafa-adai-from-tumon-bay");
  await shot(page, info, "product-tumon");
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await checkout(page);
  await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Paid");
  await expect(page.getByRole("button", { name: "CART (0)" })).toBeVisible();
  await shot(page, info, "confirmation");
  await overflow(page);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Paid");
  await expect(page.getByRole("button", { name: "CART (0)" })).toBeVisible();
});
test("map product: gallery opens in a keyboard accessible zoom viewer", async ({ page }, info) => {
  await go(page, "/products/guahan-sunset-map");
  await shot(page, info, "product-map");
  await page.getByRole("button", { name: "View image 1 of Guåhan Sunset Map" }).click();
  const dialog = page.getByRole("dialog", { name: "Artwork image viewer" });
  await expect(dialog).toBeVisible();
  const imageWidth = await dialog.locator("img").evaluate((image) => image.getBoundingClientRect().width);
  await dialog.getByRole("slider", { name: "Artwork zoom" }).fill("2");
  await expect
    .poll(() => dialog.locator("img").evaluate((image) => image.getBoundingClientRect().width))
    .toBeGreaterThan(imageWidth * 1.8);
  await expect(dialog.getByRole("slider")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "View image 1 of Guåhan Sunset Map" })).toBeFocused();
  await overflow(page);
});
test("cancel releases a reservation and restores cart without duplicates", async ({ page }) => {
  await addCore(page);
  await checkout(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No rush." })).toBeVisible();
  await expect(page.getByRole("button", { name: "CART (1)" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "No rush." })).toBeVisible();
  await page.getByRole("button", { name: "CART (1)" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("1");
  await checkout(page, "second@example.com");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByRole("status")).toHaveText("Paid");
});
test("cart: keyboard open, native focus trap, escape restores focus", async ({ page }) => {
  await go(page, "/");
  const trigger = page.getByRole("button", { name: "CART (0)" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Your cart" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
test("menu: stacked links, escape and responsive preservation", async ({ page }, info) => {
  await go(page, "/");
  const viewport = page.viewportSize()!;
  if (info.project.name === "desktop") await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "MENU", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(menu).toBeVisible();
  if (info.project.name === "desktop") await page.setViewportSize(viewport);
  await shot(page, info, "menu");
  await overflow(page);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
test("story: founder, land and sea", async ({ page }, info) => {
  await go(page, "/story");
  await expect(page.getByText("Tåno. Tåsi.", { exact: true })).toBeVisible();
  await shot(page, info, "story");
  await overflow(page);
});
test("archive: empty first-drop state", async ({ page }, info) => {
  await go(page, "/archive");
  await expect(page.getByRole("heading", { name: "Guåhan Sunset Map" })).toBeVisible();
  await expect(page.getByText("Drop 001 · Upcoming", { exact: true })).toBeVisible();
  await expect(page.getByText("Sat, Dec 5, 10:00 AM ChST", { exact: true })).toBeVisible();
  await shot(page, info, "archive-empty");
  await overflow(page);
  await page.getByRole("link", { name: "Meet Drop 001", exact: true }).click();
  await expect(page.getByRole("button", { name: "RELEASES DEC 5" })).toBeDisabled();
});
test("signup: valid email saves and invalid input stays local", async ({ page }) => {
  await go(page, "/");
  await page.getByLabel("Email for drop alerts").fill("invalid");
  await page.getByRole("button", { name: "SIGN UP", exact: true }).click();
  await expect(page.getByLabel("Email for drop alerts")).toBeVisible();
  await page.getByLabel("Email for drop alerts").fill("drop-alert@example.com");
  await page.getByRole("button", { name: "SIGN UP", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("You’re on the list. We’ll keep you posted.");
});
test("limit errors use the email allowance with an inline remove action", async ({ page }) => {
  await go(page, "/drop", "live");
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await checkout(page, "limit@example.com");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByRole("status")).toHaveText("Paid");
  await go(page, "/drop", "live");
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await page.getByLabel("Email address", { exact: true }).fill("LIMIT@example.com");
  await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This drop is limited to 2 per customer. You've already reached it with this email.");
  await page.getByRole("alert").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("A piece of home is waiting.")).toBeVisible();
});
test("all static and unavailable routes fit 320px and current viewport", async ({ page }) => {
  // Visits every route at two widths; hosted CI runners need more than the default 30s.
  test.setTimeout(120_000);
  for (const path of [
    "/",
    "/shop",
    "/drop",
    "/drops/drop-001-guahan-sunset-map",
    "/products/hafa-adai-from-tumon-bay",
    "/products/guahan-sunset-map",
    "/story",
    "/archive",
    "/missing",
    "/products/missing",
    "/orders/missing",
    "/checkout/cancel/missing",
    "/checkout/simulated/missing",
    "/info/shipping",
    "/info/faq",
    "/info/contact",
  ]) {
    await go(page, path);
    await overflow(page);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of ["/", "/shop", "/drop", "/story", "/archive", "/products/hafa-adai-from-tumon-bay"]) {
    await go(page, path);
    await overflow(page);
  }
});
test("self-hosted type renders diacritics and reduced motion keeps gentle fades", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await go(page, "/", "live");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page
      .locator(".live-dot")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
  ).toBe("none");
  await page.getByRole("button", { name: "CART (0)" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("transition-duration", "0.1s");
  await expect(dialog).toHaveCSS("transform", "none");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.evaluate(() => {
    const proof = document.createElement("div");
    proof.id = "glyph-proof";
    proof.textContent = "å ñ ʻ '";
    Object.assign(proof.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100",
      background: "var(--color-paper)",
      color: "var(--color-ink)",
      padding: "32px",
      fontSize: "64px",
      fontFamily: "var(--font-sans)",
    });
    document.body.append(proof);
  });
  await expect(page.locator("#glyph-proof")).toHaveText("å ñ ʻ '");
  await page.screenshot({ path: `.screenshots/${info.project.name}-glyphs.png` });
  await page.evaluate(() => document.getElementById("glyph-proof")?.remove());
});


test("home without an active drop: tabletop artwork and shop action", async ({ page }, info) => {
  await go(page, "/", "closed");
  await expect(page.getByRole("heading", { name: "A PIECE OF HOME." })).toBeVisible();
  await shot(page, info, "home-no-drop");
  await overflow(page);
});

for (const count of [1, 2, 3]) {
  test(`collection with ${count} products adapts on home and shop`, async ({ page }, info) => {
    for (const route of ["/", "/shop"]) {
      await go(page, `${route}?mockCore=${count}`);
      const collection = page.locator(".core-collection");
      if (count === 1) {
        await expect(collection).toHaveClass(/collection-feature/);
        await expect(collection.getByText("100 pieces · 12 × 9 in finished")).toBeVisible();
        const image = await collection.locator("img").boundingBox();
        const caption = await collection.locator(".feature-info").boundingBox();
        if (info.project.name === "desktop") {
          expect(image!.width).toBeGreaterThan(700);
          expect(caption!.x).toBeGreaterThan(image!.x + image!.width);
        } else {
          expect(image!.width).toBe(358);
          expect(caption!.y).toBeGreaterThanOrEqual(image!.y + image!.height);
        }
      } else {
        await expect(collection.locator(".product-card")).toHaveCount(count);
        const columns = await collection.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        expect(columns).toBe(info.project.name === "desktop" ? count : count === 2 ? 1 : 2);
      }
      await shot(page, info, `${route === "/" ? "home" : "shop"}-core-${count}`);
      await overflow(page);
    }
    await page.getByRole("link", { name: count === 1 ? "VIEW PUZZLE" : /Tumon Bay — Mock 2/ }).click();
    await expect(page.getByRole("button", { name: "ADD TO CART", exact: true }).first()).toBeVisible();
  });
}

test("mobile hero separates art and caption; desktop gives art 60% with visible shop actions", async ({ page }, info) => {
  for (const state of ["upcoming", "live", "closed"]) {
    await go(page, "/", state);
    const art = await page.locator(".hero > img").boundingBox();
    const caption = await page.locator(".hero-caption").boundingBox();
    if (info.project.name === "mobile") {
      expect(art!.width).toBe(390);
      expect(art!.height).toBeCloseTo(487.5);
      expect(caption!.y).toBeGreaterThanOrEqual(art!.y + art!.height);
    } else if (state !== "closed") {
      await expect(page.locator(".hero > img")).toHaveCSS("object-fit", "cover");
      expect(art!.width / page.viewportSize()!.width).toBeCloseTo(0.6);
      expect(caption!.x).toBeGreaterThanOrEqual(art!.x + art!.width);
      await expect(page.getByRole("link", { name: state === "live" ? "SHOP THE DROP" : "NOTIFY ME", exact: true })).toBeInViewport();
      await expect(page.getByRole("link", { name: "Shop Håfa Adai from Tumon Bay — $35", exact: true })).toBeInViewport();
    }
    await expect(page.locator(".hero h1")).toHaveCSS("font-variation-settings", '"wdth" 125');
    await expect(page.locator(".hero h1")).toHaveCSS("font-stretch", "125%");
    expect(await page.locator(".hero h1").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Archivo Variable");
  }
});

test("a coming-soon drop shows no date or quantity and cannot be bought", async ({ page }) => {
  await go(page, "/drop", "coming_soon");
  await expect(page.locator(".product-state")).toContainText("COMING SOON");
  await expect(page.getByText("The release date goes to the list first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "COMING SOON", exact: true }).first()).toBeDisabled();
  await expect(page.getByText(/\d+ made/)).toHaveCount(0);
  await expect(page.getByText(/ChST/)).toHaveCount(0);
  await overflow(page);
  await page.goto("/archive");
  await expect(page.getByText("Drop 001 · Coming soon")).toBeVisible();
  await page.goto("/info/faq");
  await expect(page.getByText(/next release date has not been announced/)).toBeVisible();
});

test("gallery keeps one fixed frame on phones and still swipes", async ({ page }, info) => {
  for (const route of ["/drop", "/products/hafa-adai-from-tumon-bay"]) {
    await go(page, route);
    const image = page.locator(".gallery-image img").first();
    const dimensions = await image.boundingBox();
    if (info.project.name === "mobile") {
      // One fixed square frame on phones: swiping must never resize the gallery or move the page.
      expect(dimensions!.width).toBe(358);
      expect(dimensions!.height).toBe(358);
      const titleTop = () => page.locator(".product-info h1").evaluate((el) => Math.round(el.getBoundingClientRect().top + scrollY));
      const before = await titleTop();
      await page.locator(".gallery-track").evaluate((el) => el.scrollTo({ left: el.clientWidth, behavior: "instant" }));
      await expect(page.locator(".gallery-counter")).toContainText("2 /");
      const last = await page.locator(".gallery-image").count();
      await page.locator(".gallery-track").evaluate((el, n) => el.scrollTo({ left: el.clientWidth * (n - 1), behavior: "instant" }), last);
      await expect(page.locator(".gallery-counter")).toContainText(`${last} /`);
      expect(await titleTop()).toBe(before);
      await expect(page.getByText("SWIPE TO EXPLORE", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("SWIPE TO EXPLORE", { exact: true })).toBeHidden();
      const nextImage = await page.locator(".gallery-image img").nth(1).boundingBox();
      expect(nextImage!.y).toBeGreaterThanOrEqual(dimensions!.y + dimensions!.height);
      const thirdImage = await page.locator(".gallery-image img").nth(2).boundingBox();
      expect(thirdImage!.y).toBe(nextImage!.y);
      expect(thirdImage!.x).toBeGreaterThan(nextImage!.x);
      for (const img of await page.locator(".gallery-image img").all()) {
        const ratio = await img.evaluate((el: HTMLImageElement) => ({ rendered: el.width / el.height, expected: Number(el.getAttribute("width")) / Number(el.getAttribute("height")) }));
        expect(ratio.rendered).toBeCloseTo(ratio.expected, 1);
      }
    }
  }
});

test("header rule follows scrolling without changing its height", async ({ page }) => {
  await go(page, "/");
  const header = page.locator(".site-header");
  const height = await header.evaluate((el) => el.getBoundingClientRect().height);
  await expect(header).not.toHaveClass(/is-scrolled/);
  expect(await header.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe("rgba(0, 0, 0, 0)");
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(header).toHaveClass(/is-scrolled/);
  expect(await header.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe("rgb(221, 213, 200)");
  expect(await header.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).not.toHaveClass(/is-scrolled/);
  expect(await header.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
});

for (const retry of ["same_key", "new_checkout"]) {
  test(`payment failure ${retry}: recover with the correct key and complete payment`, async ({ page }) => {
    await go(page, `/products/hafa-adai-from-tumon-bay?mockPayment=${retry}`);
    await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
    await page.getByLabel("Email address", { exact: true }).fill("recovery@example.com");
    await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
    const action = page.getByRole("button", { name: retry === "same_key" ? "Try again" : "Start a new checkout", exact: true });
    await expect(action).toBeVisible();
    const attempts = await page.evaluate(() => JSON.parse(sessionStorage.getItem("tyt-mock-db")!).attempts);
    const firstKey = Object.keys(attempts)[0];
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("tyt-checkout-attempt") || "null")?.key ?? null)).toBe(retry === "same_key" ? firstKey : null);
    await action.click();
    await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("tyt-mock-db")!).attempts));
    expect(keys.length).toBe(retry === "same_key" ? 1 : 2);
    await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Paid");
    await expect(page.getByRole("button", { name: "CART (0)" })).toBeVisible();
    await overflow(page);
  });
}
test("last-unit reservation retries after lost provider setup despite refreshed zero stock", async ({ page }) => {
  await go(page, "/products/hafa-adai-from-tumon-bay?mockPayment=same_key");
  // Own this tab's isolated MSW fixture: one remaining core unit.
  await page.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem("tyt-mock-db")!);
    db.stock["hafa-adai-from-tumon-bay"] = 1;
    sessionStorage.setItem("tyt-mock-db", JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await page.getByLabel("Email address", { exact: true }).fill("last-unit@example.com");
  await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  const action = page.getByRole("button", { name: "Try again", exact: true });
  await expect(action).toBeEnabled();
  const originalKey = await page.evaluate(() => JSON.parse(sessionStorage.getItem("tyt-checkout-attempt")!).key);
  // Reopen after refresh to prove stock 0 does not block the existing reservation.
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.getByRole("button", { name: "CART (1)" }).click();
  await expect(page.getByRole("button", { name: "CHECKOUT", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("tyt-checkout-attempt")!).key)).toBe(originalKey);
  await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Paid");
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("tyt-mock-db")!).stock["hafa-adai-from-tumon-bay"])).toBe(0);
});
test("order A payment preserves a re-added cart and checkout B reservation", async ({ page }) => {
  await addCore(page);
  await checkout(page, "order-a@example.com");
  const paymentA = page.url();
  // Change the cart through its controls before completing A.
  await page.getByRole("button", { name: "CART (1)" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  await addCore(page);
  await checkout(page, "order-b@example.com");
  const attemptB = await page.evaluate(() => sessionStorage.getItem("tyt-checkout-attempt"));
  await page.goto(paymentA);
  await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Paid");
  await expect(page.getByRole("button", { name: "CART (1)" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("tyt-checkout-attempt"))).toBe(attemptB);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Paid");
  await expect(page.getByRole("button", { name: "CART (1)" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("tyt-checkout-attempt"))).toBe(attemptB);
});


test("home core link names the buyable puzzle and preserves the path into cart", async ({ page }) => {
  await go(page, "/");
  const core = page.getByRole("link", { name: "Shop Håfa Adai from Tumon Bay — $35", exact: true });
  await expect(core).toBeInViewport();
  await core.click();
  await expect(page).toHaveURL(/products\/hafa-adai-from-tumon-bay/);
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart).toBeVisible();
  await expect(cart.getByRole("status")).toHaveText("1");
  await expect(cart.getByText("$35", { exact: true })).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "CART (1)" }).click();
  await expect(cart.getByRole("status")).toHaveText("1");
});

test("shipping, FAQ and product details publish supported facts without preview filler", async ({ page }, info) => {
  await go(page, "/info/faq");
  await expect(page.getByText(/Drop 001 releases Sat, Dec 5, 10:00 AM ChST/)).toContainText("Fri, Dec 4, 4:00 PM PT · Fri, Dec 4, 2:00 PM HT");
  await expect(page.getByText("Drop 001 is limited to 2 per customer.")).toBeVisible();
  await expect(page.getByText("No. Drops are one-time releases and never restock.")).toBeVisible();
  await expect(page.getByText(/held for about 30 minutes/)).toBeVisible();
  await shot(page, info, "faq");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Contact", exact: true })).toHaveCount(0);
  await expect(footer.getByText(/coming soon/i)).toHaveCount(0);
  await footer.getByRole("link", { name: "Shipping", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shipping", exact: true })).toBeVisible();
  await expect(page.getByText("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico.")).toBeVisible();
  await go(page, "/products/hafa-adai-from-tumon-bay");
  await expect(page.getByText("Box size", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Material", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Preview details/)).toHaveCount(0);
  await page.locator("summary").filter({ hasText: /^Shipping$/ }).click();
  await expect(page.getByText("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico.")).toBeVisible();
  await overflow(page);
});

test("storefront type stays at least 12px and placeholder text uses the readable ink token", async ({ page }) => {
  await go(page, "/");
  expect(await page.evaluate(() => [...document.querySelectorAll("header *, main *, footer *")].filter((el) =>
    el.textContent?.trim() && el.checkVisibility() && parseFloat(getComputedStyle(el).fontSize) < 12
  ).map((el) => el.className))).toEqual([]);
  expect(await page.getByLabel("Email for drop alerts").evaluate((input) => ({
    placeholder: getComputedStyle(input, "::placeholder").color,
    muted: getComputedStyle(document.querySelector(".muted")!).color,
  }))).toEqual({ placeholder: "rgb(95, 90, 83)", muted: "rgb(95, 90, 83)" });
});
