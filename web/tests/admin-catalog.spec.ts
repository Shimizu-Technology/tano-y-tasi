import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const folder = "public/images/products/hafa-adai-from-tumon-bay";
const large = `${folder}/finished-flat-2000.webp`; // 2000 × 1167, so all three sizes
const medium = `${folder}/piece-detail-1071.webp`; // 1071 wide, so 640 only
const bucket = "https://tano-y-tasi-media.s3.ap-southeast-1.amazonaws.com";
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==", "base64");

const capture = async (page: Page, name: string, project: string) => {
  await mkdir(".screenshots", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(260);
  await page.screenshot({ path: `.screenshots/catalog-${project}-${name}.png`, fullPage: true });
};
const openSection = async (page: Page, label: string) => {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
};
const goTo = (page: Page, path: string) =>
  page.evaluate((target) => {
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
const expectFits = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};
const productPatch = (page: Page, slug: string) =>
  page.waitForRequest((request) => request.url().endsWith(`/api/v1/admin/products/${slug}`) && request.method() === "PATCH");
const createProduct = async (page: Page, name = "Håfa Adai Mañana") => {
  await openSection(page, "Products");
  await page.getByRole("link", { name: "New product" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Price (USD)").fill("28.50");
  await page.getByLabel("Summary").fill("Sunrise over the reef.");
  await page.getByLabel("Description").fill("A sunrise over the reef at Tumon, made to come back to.");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
};
// Every bundled WebP is decodable, so the canvas path runs on real pixels.
const pick = (page: Page, ...files: string[]) => page.getByLabel("Choose images").setInputFiles(files);

test.beforeEach(async ({ page }) => {
  await page.goto("/admin?mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("a founder creates a product, uploads and orders images, and sees it on the storefront", async ({ page }, testInfo) => {
  await openSection(page, "Products");
  await capture(page, "products", testInfo.project.name);
  await page.getByRole("link", { name: "New product" }).click();
  await page.getByRole("button", { name: "Create product" }).click();
  for (const field of ["Name", "Summary", "Description"]) await expect(page.getByLabel(field)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#name-error")).toBeVisible();
  await expectFits(page);
  await capture(page, "new-product-errors", testInfo.project.name);

  await page.getByLabel("Name").fill("Håfa Adai Mañana");
  await page.getByLabel("Price (USD)").fill("28.50");
  await page.getByLabel("Summary").fill("Sunrise over the reef.");
  await page.getByLabel("Description").fill("A sunrise over the reef at Tumon, made to come back to.");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/hafa-adai-manana$/);
  await expect(page.getByText("No images yet")).toBeVisible();
  await expect(page.getByText("0 units")).toBeVisible();

  await pick(page, large, medium);
  const rows = page.locator(".admin-image-row");
  await expect(rows).toHaveCount(2);
  await expect(page.locator(".admin-upload-list")).toHaveCount(0);
  const previews = await rows.locator("img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth));
  expect(previews.every((width) => width === 640)).toBe(true);

  // Alt text is required, and the error sits on the field that needs it.
  await page.getByRole("button", { name: "Save images" }).click();
  await expect(rows.first().getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  await expect(rows.first().getByRole("textbox")).toBeFocused();
  await rows.nth(0).getByRole("textbox").fill("The finished puzzle of Tumon Bay.");
  await rows.nth(1).getByRole("textbox").fill("Close view of interlocking pieces.");
  await rows.nth(1).getByRole("combobox").selectOption("detail");
  await expect(rows.nth(0).getByRole("combobox")).toHaveValue("hero");
  await expect(rows.nth(1).getByRole("combobox")).toHaveValue("detail");

  // Reorder with the buttons; the keyboard stays on the image that moved.
  await page.getByRole("button", { name: "Move image 2 up" }).click();
  await expect(rows.nth(0).getByRole("textbox")).toHaveValue("Close view of interlocking pieces.");
  await expect(rows.nth(0).getByRole("button", { name: "Move image 1 down" })).toBeFocused();
  await expect(rows.nth(0).getByRole("button", { name: "Move image 1 up" })).toBeDisabled();
  await page.getByRole("button", { name: "Move image 1 down" }).click();
  await expect(rows.nth(0).getByRole("textbox")).toHaveValue("The finished puzzle of Tumon Bay.");
  await expectFits(page);
  await capture(page, "images-unsaved", testInfo.project.name);

  const saved = productPatch(page, "hafa-adai-manana");
  await page.getByRole("button", { name: "Save images" }).click();
  const { images } = (await saved).postDataJSON();
  await expect(page.getByText("Images saved.")).toBeVisible();
  expect(images).toEqual([
    expect.objectContaining({ role: "hero", alt: "The finished puzzle of Tumon Bay.", widths: [640, 1280, 2000], aspect: expect.stringMatching(/^\d+:\d+$/), base: expect.stringContaining(`${bucket}/products/hafa-adai-manana/`) }),
    expect.objectContaining({ role: "detail", widths: [640], base: expect.stringContaining(`${bucket}/products/hafa-adai-manana/`) }),
  ]);
  expect(Object.keys(images[0]).sort()).toEqual(["alt", "aspect", "base", "role", "widths"]);
  await expect(page.getByRole("button", { name: "Save images" })).toBeDisabled();

  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.getByLabel("Adjustment (+ / −)").fill("5");
  await page.getByLabel("Reason").fill("First delivery");
  await page.getByRole("button", { name: "Adjust stock" }).click();
  await expect(page.getByText("5 units")).toBeVisible();
  await capture(page, "editor-saved", testInfo.project.name);

  await page.getByRole("link", { name: "View on site" }).click();
  await expect(page.getByRole("heading", { name: "Håfa Adai Mañana" })).toBeVisible();
  const lead = page.locator(".product-layout img").first();
  await expect(lead).toHaveAttribute("src", new RegExp(`^${bucket}/products/hafa-adai-manana/`));
  await expect.poll(() => lead.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expectFits(page);
  await capture(page, "storefront-product", testInfo.project.name);

  await goTo(page, "/shop");
  await expect(page.getByText("Håfa Adai Mañana")).toBeVisible();
  await expect(page.getByRole("link", { name: /Håfa Adai from Tumon Bay/ })).toBeVisible();
  await capture(page, "storefront-shop", testInfo.project.name);
});

test("the encoder fallback produces real WebP when the browser can only make PNG, as Safari does", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      original.call(this, callback, "image/png");
    };
  });
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok");
  await pick(page, medium);
  // The mock store refuses anything that isn't really WebP, as a guard against storing PNG bytes.
  await expect(page.locator(".admin-image-row")).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator(".admin-upload-list")).toHaveCount(0);
});

test("uploads work under the production image and connection rules, with no blob: allowance", async ({ page }) => {
  const netlify = await readFile("../netlify.toml", "utf8");
  const directive = (name: string) => new RegExp(`${name} ([^;]+);`).exec(netlify)![1];
  const script = directive("script-src");
  expect(script).toContain("'wasm-unsafe-eval'");
  const policy = [
    `img-src ${directive("img-src")}`,
    // Vite's dev preamble is inline and its API default is a different port; neither exists in production.
    `connect-src ${directive("connect-src")} http://localhost:3031 ws://localhost:*`,
    `script-src ${script} 'unsafe-inline'`,
  ].join("; ");
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });
  await page.route("**/admin/**", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      original.call(this, callback, "image/png");
    };
  });
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok");
  await pick(page, medium);
  const row = page.locator(".admin-image-row").nth(3);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => row.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(640);
  expect(blocked).toEqual([]);
});

test("bad files get a plain message and nothing is uploaded", async ({ page }) => {
  await createProduct(page);
  await page.getByLabel("Choose images").setInputFiles([
    { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") },
    { name: "tiny.png", mimeType: "image/png", buffer: tinyPng },
    { name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") },
  ]);
  await expect(page.getByText("notes.pdf isn't an image.")).toBeVisible();
  await expect(page.getByText(/tiny\.png is only 1 pixels wide/)).toBeVisible();
  await expect(page.getByText(/broken\.jpg couldn't be opened/)).toBeVisible();
  await expect(page.locator(".admin-image-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save images" })).toBeDisabled();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(page.getByText("notes.pdf isn't an image.")).toHaveCount(0);
});

test("a failed upload can be tried again", async ({ page }, testInfo) => {
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok&mockUpload=fail-once");
  await expect(page.locator(".admin-image-row")).toHaveCount(3);
  await pick(page, medium);
  await expect(page.getByText("The image store refused this upload. Try again.")).toBeVisible();
  await expectFits(page);
  await capture(page, "upload-failed", testInfo.project.name);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".admin-image-row")).toHaveCount(4);
  await expect(page.locator(".admin-upload-list")).toHaveCount(0);
});

test("missing storage says so instead of failing silently", async ({ page }) => {
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok&mockUpload=unconfigured");
  await pick(page, medium);
  await expect(page.getByText("Image uploads aren't set up yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Håfa Adai from Tumon Bay" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin unavailable" })).toHaveCount(0);
});

test("a dropped connection leaves the editor and its unsaved work in place", async ({ page }) => {
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok&mockUpload=offline");
  await page.getByLabel("Price (USD)").fill("36.50");
  await pick(page, medium);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin unavailable" })).toHaveCount(0);
  await expect(page.getByLabel("Price (USD)")).toHaveValue("36.50");
});

test("existing images keep working and leaving with unsaved changes asks first", async ({ page }) => {
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Håfa Adai from Tumon Bay" }).first().click();
  const rows = page.locator(".admin-image-row");
  await expect(rows).toHaveCount(3);
  await expect.poll(() => rows.first().locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Save images" })).toBeDisabled();

  await page.getByRole("button", { name: "Remove image 3" }).click();
  await expect(rows).toHaveCount(2);
  const answers: string[] = [];
  let accept = false;
  page.on("dialog", (dialog) => {
    answers.push(dialog.message());
    void (accept ? dialog.accept() : dialog.dismiss());
  });
  await openSection(page, "Drops");
  await expect.poll(() => answers).toEqual(["Discard unsaved changes?"]);
  await expect(page).toHaveURL(/\/admin\/products\/hafa-adai-from-tumon-bay/);

  await page.keyboard.press("Escape");
  const saved = productPatch(page, "hafa-adai-from-tumon-bay");
  await page.getByRole("button", { name: "Save images" }).click();
  const body = (await saved).postDataJSON();
  expect(body.images).toHaveLength(2);
  expect(Object.keys(body)).toEqual(["images"]);
  await expect(page.getByText("Images saved.")).toBeVisible();
  accept = true;
  await openSection(page, "Drops");
  await expect(page).toHaveURL(/\/admin\/drops$/);
  expect(answers).toHaveLength(1);
});

test("the not-confirmed checklist uses plain names and keeps keys it doesn't know", async ({ page }, testInfo) => {
  await page.evaluate(async () => {
    await fetch("/api/v1/admin/products/guahan-sunset-map", {
      method: "PATCH",
      headers: { Authorization: "Bearer tyt-admin-test-auth", "Content-Type": "application/json" },
      body: JSON.stringify({ placeholders: ["price_cents", "future.note", "specs.box_size"] }),
    });
  });
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  const checklist = page.getByRole("group", { name: "Not confirmed yet: hide from customers where we can" });
  for (const label of ["Price", "Stock", "Pieces", "Finished size", "Box size", "Material", "Cut", "Made in", "What's in the box", "Art credit", "Release date", "Quantity"])
    await expect(checklist.getByLabel(label, { exact: true })).toBeVisible();
  await expect(checklist.getByLabel("Price", { exact: true })).toBeChecked();
  await expect(checklist.getByLabel("Box size", { exact: true })).toBeChecked();
  await expect(checklist.getByLabel("Material", { exact: true })).not.toBeChecked();
  await expect(page.locator('textarea[name="placeholders"]')).toHaveCount(0);
  const heights = await checklist.locator("label").evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

  await checklist.getByLabel("Box size", { exact: true }).uncheck();
  await checklist.getByLabel("Material", { exact: true }).check();
  const saved = productPatch(page, "guahan-sunset-map");
  await page.getByRole("button", { name: "Save product" }).click();
  expect((await saved).postDataJSON()).toEqual({ placeholders: ["price_cents", "future.note", "specs.material"] });
  await expectFits(page);
  await capture(page, "checklist", testInfo.project.name);
});

test("a new drop gets the next number, stays productless, and a product can move in and out", async ({ page }, testInfo) => {
  await openSection(page, "Drops");
  await page.getByRole("link", { name: "New drop" }).click();
  await page.getByRole("button", { name: "Create drop" }).click();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Name").fill("Håfa Adai Mañana");
  await page.getByLabel("Per customer limit").fill("0");
  await page.getByRole("button", { name: "Create drop" }).click();
  await expect(page.locator("#per_customer_limit-error")).toBeVisible();
  await page.getByLabel("Per customer limit").fill("3");
  await page.getByLabel("Announced quantity").fill("250");
  await expectFits(page);
  await capture(page, "new-drop", testInfo.project.name);
  const created = page.waitForRequest((request) => request.url().endsWith("/api/v1/admin/drops") && request.method() === "POST");
  await page.getByRole("button", { name: "Create drop" }).click();
  expect((await created).postDataJSON()).toEqual({ name: "Håfa Adai Mañana", release_at: null, closes_at: null, per_customer_limit: 3, quantity: 250 });
  await expect(page).toHaveURL(/\/admin\/drops\/drop-002-hafa-adai-manana$/);
  await expect(page.getByText("No product yet, so this drop isn't on the site.")).toBeVisible();
  await capture(page, "drop-no-product", testInfo.project.name);

  // The map moves from its drop to the always-available collection, with a confirm.
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  const sold = page.getByLabel("Sold in");
  await expect(sold).toHaveValue("drop-001-guahan-sunset-map");
  await expect(page.getByRole("button", { name: "Move product" })).toBeDisabled();
  await sold.selectOption("core");
  const questions: string[] = [];
  let accept = false;
  page.on("dialog", (dialog) => {
    questions.push(dialog.message());
    void (accept ? dialog.accept() : dialog.dismiss());
  });
  await page.getByRole("button", { name: "Move product" }).click();
  await expect.poll(() => questions.length).toBe(1);
  expect(questions[0]).toContain("always-available collection");
  expect(questions[0]).toContain("Guåhan Sunset Map will have no product");
  await expect(sold).toHaveValue("core");
  accept = true;
  const moved = productPatch(page, "guahan-sunset-map");
  await page.getByRole("button", { name: "Move product" }).click();
  expect((await moved).postDataJSON()).toEqual({ kind: "core", drop_slug: null });
  await expect(page.getByText("Moved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Move product" })).toBeDisabled();
  await expectFits(page);
  await capture(page, "placement", testInfo.project.name);

  // A drop can hold several products: the Tumon puzzle moves in, then the map joins it.
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Håfa Adai from Tumon Bay" }).first().click();
  await page.getByLabel("Sold in").selectOption("drop-002-hafa-adai-manana");
  const into = productPatch(page, "hafa-adai-from-tumon-bay");
  await page.getByRole("button", { name: "Move product" }).click();
  expect((await into).postDataJSON()).toEqual({ kind: "drop", drop_slug: "drop-002-hafa-adai-manana" });
  await expect(page.getByText("Moved.")).toBeVisible();
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  await page.getByLabel("Sold in").selectOption("drop-002-hafa-adai-manana");
  await page.getByRole("button", { name: "Move product" }).click();
  await expect(page.getByText("Moved.")).toBeVisible();
});

test("image controls stay reachable on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone target sizes");
  await page.goto("/admin/products/guahan-sunset-map?mockAdmin=ok");
  const rows = page.locator(".admin-image-row");
  await expect(rows).toHaveCount(4);
  for (const button of await rows.first().getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Add images", "Save images", "Move product", "Save product"]) {
    expect((await page.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expectFits(page);
});
