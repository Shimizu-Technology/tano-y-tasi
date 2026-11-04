import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const artwork = "public/images/products/hafa-adai-from-tumon-bay/finished-flat-2000.webp";

const capture = async (page: Page, name: string, project: string) => {
  await mkdir(".screenshots", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(260);
  await page.screenshot({ path: `.screenshots/commerce-${project}-${name}.png`, fullPage: true });
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
const createProduct = async (page: Page, name: string) => {
  await openSection(page, "Products");
  await page.getByRole("link", { name: "New product" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Price (USD)").fill("40");
  await page.getByLabel("Summary").fill("Sunrise over the bay.");
  await page.getByLabel("Description").fill("Sunrise over Hagåtña Bay, made to come back to.");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
};
const addImage = async (page: Page) => {
  await page.getByLabel("Choose images").setInputFiles(artwork);
  await page.locator(".admin-image-row").first().getByRole("textbox").fill("The finished puzzle.");
  await page.getByRole("button", { name: "Save images" }).click();
  await expect(page.getByText("Images saved.")).toBeVisible();
};
const accept = (page: Page) => page.on("dialog", (dialog) => void dialog.accept());

test("a founder creates a limited preorder, receives its run, and a customer buys it", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await page.goto("/admin?mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await createProduct(page, "Hagåtña Sunrise");
  await addImage(page);
  await page.getByLabel("Status").selectOption("active");

  // A preorder can't be saved without its ship date, and the error sits on the field.
  await page.getByRole("checkbox", { name: /Sell as a preorder/ }).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByLabel("When it ships")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#preorder_ships-error")).toBeVisible();
  await page.getByLabel("When it ships").fill("Ships late January 2027");
  await page.getByLabel("Limit per customer").fill("2");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  // The units come from a production run, received in one step.
  await page.getByRole("button", { name: "Add a run" }).click();
  await page.getByLabel("Units ordered").fill("6");
  await page.getByLabel("Cost per unit (USD)").fill("8");
  await page.getByLabel("Supplier").fill("Shenzhen Puzzle Co");
  await page.getByLabel("Expected date").fill("2027-01-15");
  await page.getByRole("button", { name: "Save run" }).click();
  const run = page.locator(".admin-run");
  await expect(run.getByText("6 units")).toBeVisible();
  await expect(run.getByText("Jan 15, 2027")).toBeVisible();
  await expect(run.getByText(/80% margin/)).toBeVisible();
  await expect(page.getByText("0 units")).toBeVisible();
  await expectFits(page);
  await capture(page, "run-ordered", project);
  // A quantity edited after the card first appeared is what receiving offers.
  await run.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Units ordered").fill("9");
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(run.getByText("9 units")).toBeVisible();
  await run.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Units ordered").fill("6");
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(run.getByText("6 units")).toBeVisible();
  await run.getByRole("button", { name: "Receive" }).click();
  await expect(run.getByLabel("Units to add to stock")).toHaveValue("6");
  await run.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("Received. 6 units added to stock.")).toBeVisible();
  await expect(page.locator(".admin-stock")).toHaveText("6 units");
  await expect(run.getByRole("button", { name: "Receive" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Production run", exact: false })).toBeVisible();
  await capture(page, "run-received", project);

  // The storefront sells it as a preorder, up to the limit.
  await goTo(page, "/products/hagatna-sunrise");
  const buy = page.getByRole("button", { name: "PREORDER" }).first();
  await expect(buy).toBeVisible();
  await expect(page.locator(".product-info").getByText("Ships late January 2027")).toBeVisible();
  await expect(page.getByText("Limit 2 per customer")).toBeVisible();
  await expect(page.getByText("Only 6 left")).toBeVisible();
  await expectFits(page);
  await capture(page, "storefront-preorder", project);
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  await buy.click();

  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart.getByText("Ships late January 2027")).toBeVisible();
  await expect(cart.getByRole("button", { name: /Increase quantity/ })).toBeDisabled();
  await capture(page, "cart-preorder", project);
  await cart.getByLabel("Email address", { exact: true }).fill("qa@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();

  // The redirect reloads the page, so this part reads the order's own snapshot.
  await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
  await expect(page.getByText("Ships late January 2027")).toBeVisible();
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
  await expect(page.getByText("Your preorder is confirmed. It ships on the date shown below.")).toBeVisible();
  await expect(page.locator(".order-line").getByText("Ships late January 2027")).toBeVisible();
  await page.reload();
  await expect(page.locator(".order-line").getByText("Ships late January 2027")).toBeVisible();
  await expectFits(page);
  await capture(page, "order-preorder", project);
});

test("a customer who reaches a limit is told plainly, with a fix, for a core product", async ({ page }) => {
  await page.goto("/products/hagatna-sunrise?mockPreorder=1&mockDrop=upcoming");
  await page.getByRole("button", { name: "PREORDER" }).first().click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await cart.getByLabel("Email address", { exact: true }).fill("qa@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();

  await page.goto("/products/hagatna-sunrise");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "PREORDER" }).first().click();
  await cart.getByLabel("Email address", { exact: true }).fill("qa@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(cart.getByText("This item is limited to 2 per customer. You can order 1 more with this email.")).toBeVisible();
  await cart.getByRole("button", { name: "Reduce to 1" }).click();
  await expect(cart.getByText(/limited to 2/)).toHaveCount(0);
});

test("a mixed cart is labelled, and its order is obvious in the admin", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await page.goto("/products/hagatna-sunrise?mockPreorder=1&mockDrop=upcoming");
  await page.getByRole("button", { name: "PREORDER" }).first().click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart.getByText("Ships late January 2027")).toBeVisible();
  await expect(cart.getByText(/may ship together/)).toHaveCount(0);
  await cart.getByRole("button", { name: "CLOSE" }).click();
  await page.goto("/products/hafa-adai-from-tumon-bay");
  await page.getByRole("button", { name: "ADD TO CART" }).first().click();
  await expect(cart.getByText(/your whole order may ship together/)).toBeVisible();
  await expect(cart.getByText("Preorder.")).toHaveCount(1);
  await capture(page, "cart-mixed", project);
  await cart.getByRole("button", { name: "CLOSE" }).click();

  await page.goto("/admin/orders?mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  const row = project === "mobile" ? page.locator(".admin-card", { hasText: "TYT-100002" }) : page.getByRole("row", { name: /TYT-100002/ });
  await expect(row.getByText("preorder")).toBeVisible();
  const plain = project === "mobile" ? page.locator(".admin-card", { hasText: "TYT-100001" }) : page.getByRole("row", { name: /TYT-100001/ });
  await expect(plain.getByText("preorder")).toHaveCount(0);
  await capture(page, "orders-preorder", project);

  await (project === "mobile" ? row : row.getByRole("link").first()).click();
  await expect(page.getByRole("heading", { name: "TYT-100002" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Hagåtña Sunrise.*Ships late January 2027/ })).toBeVisible();
  const warning = page.getByRole("note");
  await expect(warning.getByText("Don't ship the preorder items early.")).toBeVisible();
  await expect(warning.getByText("Hagåtña Sunrise × 2: Ships late January 2027")).toBeVisible();
  await expect(warning.getByText(/One fulfill action covers the whole order/)).toBeVisible();
  await expectFits(page);
  await capture(page, "order-preorder-admin", project);

  // Fulfilling asks first: declining leaves the order as it was.
  let prompts = 0;
  page.once("dialog", (dialog) => { prompts++; void dialog.dismiss(); });
  await page.getByRole("button", { name: "Fulfill order" }).click();
  await expect.poll(() => prompts).toBe(1);
  await expect(page.getByRole("button", { name: "Fulfill order" })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Fulfill order" }).click();
  await expect(page.getByRole("button", { name: "Unfulfill" })).toBeVisible();
});

test("a founder attaches two products to a drop, and every page copes", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  accept(page);
  await page.goto("/admin?mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await openSection(page, "Drops");
  await page.getByRole("link", { name: "New drop" }).click();
  await page.getByLabel("Name").fill("Village Series");
  await page.getByLabel(/^Release/).fill("2026-11-01T10:00");
  await page.getByRole("button", { name: "Create drop" }).click();
  await expect(page.getByRole("heading", { name: "Village Series" })).toBeVisible();
  await expect(page.getByText("No product yet, so this drop isn't on the site.")).toBeVisible();

  // Attach from the drop itself, twice. Nothing limits a drop to one product now.
  for (const name of ["Håfa Adai from Tumon Bay", "Guåhan Sunset Map"]) {
    await page.getByLabel("Add a product").selectOption({ label: name === "Guåhan Sunset Map" ? "Guåhan Sunset Map (in Guåhan Sunset Map)" : name });
    await page.getByRole("button", { name: "Add to drop" }).click();
    await expect(page.getByText(`${name} added.`)).toBeVisible();
    await expect(page.locator(".admin-drop-products").getByRole("link", { name })).toBeVisible();
  }
  await expect(page.locator(".admin-drop-products li")).toHaveCount(2);
  await expectFits(page);
  await capture(page, "drop-two-products", project);

  await goTo(page, "/drops/drop-002-village-series");
  await expect(page.getByRole("heading", { level: 1, name: "Village Series" })).toBeVisible();
  await expect(page.getByText("DROP 002 · AVAILABLE NOW")).toBeVisible();
  const cards = page.locator(".core-collection .product-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("href", "/products/hafa-adai-from-tumon-bay");
  await expectFits(page);
  await capture(page, "drop-grid", project);
  await cards.nth(1).click();
  await expect(page.getByRole("heading", { level: 1, name: "Guåhan Sunset Map" })).toBeVisible();
  await expect(page.getByRole("link", { name: "DROP 002" })).toHaveAttribute("href", "/drops/drop-002-village-series");
  await expect(page.getByRole("button", { name: "ADD TO CART" }).first()).toBeEnabled();
});

for (const state of ["upcoming", "live", "sold_out", "closed"]) {
  test(`a ${state} drop with several products reads properly on every page`, async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    await page.goto(`/?mockDrop=${state}&mockDropItems=2`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (state === "upcoming" || state === "live") await expect(page.getByText("2 items in this drop.")).toBeVisible();
    else await expect(page.locator(".home-drop")).toHaveCount(0);
    await expectFits(page);

    await page.goto("/drop");
    await expect(page.getByRole("heading", { level: 1, name: "Guåhan Sunset Map" })).toBeVisible();
    await expect(page.locator(".core-collection .product-card")).toHaveCount(2);
    await expect(page.locator(".product-layout")).toHaveCount(0);
    await expectFits(page);
    await capture(page, `drop-${state}`, project);

    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
    await expectFits(page);

    await page.goto("/archive");
    await expect(page.getByRole("heading", { level: 1, name: "ARCHIVE" })).toBeVisible();
    await expect(page.getByText("Guåhan Sunset Map").first()).toBeVisible();
    await expectFits(page);
  });
}

test("a drop with one product keeps today's product page", async ({ page }) => {
  await page.goto("/drop?mockDrop=live&mockDropItems=1");
  await expect(page.getByRole("heading", { level: 1, name: "Guåhan Sunset Map" })).toBeVisible();
  await expect(page.locator(".product-layout")).toBeVisible();
  await expect(page.getByRole("button", { name: "ADD TO CART" }).first()).toBeEnabled();
});

test("a signature product leads the collection, with a quiet label", async ({ page }, testInfo) => {
  await page.goto("/admin/products/hagatna-sunrise?mockAdmin=ok&mockPreorder=1");
  await page.getByRole("checkbox", { name: /Signature product/ }).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await goTo(page, "/shop");
  const cards = page.locator(".core-collection .product-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Hagåtña Sunrise");
  await expect(cards.first()).toContainText("SIGNATURE · PREORDER");
  await expectFits(page);
  await capture(page, "signature", testInfo.project.name);
});

test("a production run can be edited and canceled, and is admin only", async ({ page }) => {
  const requests: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/v1/") && !response.url().includes("/admin/")) requests.push(await response.text().catch(() => ""));
  });
  accept(page);
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok");
  await page.getByRole("button", { name: "Add a run" }).click();
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(page.getByLabel("Units ordered")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Units ordered").fill("500");
  await page.getByLabel("Cost per unit (USD)").fill("7.20");
  await page.getByLabel("Supplier").fill("Shenzhen Puzzle Co");
  await page.getByRole("button", { name: "Save run" }).click();
  const run = page.locator(".admin-run");
  await expect(run.getByText("500 units")).toBeVisible();
  await run.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Units ordered").fill("450");
  await page.getByRole("button", { name: "Save run" }).click();
  await expect(run.getByText("450 units")).toBeVisible();
  await run.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByText("Run canceled.")).toBeVisible();
  await expect(run.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".admin-stock")).toHaveText("40 units");

  await page.goto("/products/hafa-adai-from-tumon-bay");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(requests.join(" ")).not.toMatch(/unit_cost|Shenzhen|production_run/);
});

test("leaving a half-written run asks first", async ({ page }) => {
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok");
  await page.getByRole("button", { name: "Add a run" }).click();
  await page.getByLabel("Units ordered").fill("500");
  let asked = "";
  page.once("dialog", (dialog) => { asked = dialog.message(); void dialog.dismiss(); });
  await page.getByRole("link", { name: "← Products" }).click();
  await expect.poll(() => asked).toBe("Discard unsaved changes?");
  await expect(page.getByLabel("Units ordered")).toHaveValue("500");
});
