import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const capture = async (page: import("@playwright/test").Page, name: string, project: string) => {
  await mkdir(".screenshots", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(260);
  await page.screenshot({ path: `.screenshots/admin-${project}-${name}.png`, fullPage: true });
};
const openSection = async (page: import("@playwright/test").Page, label: string) => {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
};
test.beforeEach(async ({ page }) => {
  await page.goto("/admin?mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
test("dashboard shows KPIs and featured drop", async ({ page }, testInfo) => {
  await expect(page.getByText("Paid revenue")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured drop" })).toBeVisible();
  await capture(page, "dashboard", testInfo.project.name);
});
test("orders retain filters through detail and can be fulfilled", async ({ page }, testInfo) => {
  await openSection(page, "Orders");
  await page.getByLabel("Status").selectOption("paid");
  await expect(page).toHaveURL(/status=paid/);
  await capture(page, "orders", testInfo.project.name);
  await page.getByRole("link", { name: "TYT-100001" }).first().click();
  await expect(page.getByRole("heading", { name: "TYT-100001" })).toBeVisible();
  await expect(page.getByText("Example Buyer")).toBeVisible();
  await expect(page.getByText("123 Marine Drive")).toBeVisible();
  await expect(page.getByText("Hagåtña, GU, 96910")).toBeVisible();
  await capture(page, "order-detail", testInfo.project.name);
  await page.getByLabel("Tracking number").fill("GU12345");
  await page.getByRole("button", { name: "Fulfill order" }).click();
  await expect(page.getByText("Tracking: GU12345")).toBeVisible();
  await page.getByRole("link", { name: "← Orders" }).click();
  await expect(page).toHaveURL(/status=paid/);
});
test("a partial refund updates the order and the field resets to the balance", async ({ page }) => {
  await openSection(page, "Orders");
  await page.getByRole("link", { name: /TYT-/ }).first().click();
  page.on("dialog", (dialog) => void dialog.accept());
  const field = page.getByLabel(/Refund amount/);
  await field.fill("999999");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByText(/Enter a refund between/)).toBeVisible();
  await field.fill("5.00");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await expect(page.locator(".admin-meta")).toContainText("$5");
});
test("product editing and stock adjustments persist in the mock session", async ({ page }, testInfo) => {
  await openSection(page, "Products");
  await capture(page, "products", testInfo.project.name);
  await page.getByRole("link", { name: "Håfa Adai from Tumon Bay" }).first().click();
  await page.getByLabel("Price (USD)").fill("36.50");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.getByLabel("Adjustment (+ / −)").fill("-2");
  await page.getByLabel("Reason").fill("Damaged box");
  await page.getByRole("button", { name: "Adjust stock" }).click();
  await expect(page.getByText("38 units")).toBeVisible();
  await expect(page.getByText("Damaged box")).toBeVisible();
  await capture(page, "product-detail", testInfo.project.name);
});
test("product PATCH sends only a changed price and leaves specs untouched", async ({ page }) => {
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Håfa Adai from Tumon Bay" }).first().click();
  await page.getByLabel("Price (USD)").fill("36.50");
  const savedRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/admin/products/hafa-adai-from-tumon-bay") &&
      request.method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save product" }).click();
  expect((await savedRequest).postDataJSON()).toEqual({ price_cents: 3650 });
});
test("editing a numeric product spec preserves its number type", async ({ page }) => {
  await openSection(page, "Products");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  const pieceCount = page.locator(".admin-spec-row").filter({ has: page.locator('input[value="piece_count"]') });
  await pieceCount.getByRole("spinbutton").fill("1000");
  const savedRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/admin/products/guahan-sunset-map") && request.method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save product" }).click();
  const body = (await savedRequest).postDataJSON();
  expect(body).toEqual({
    specs: expect.objectContaining({ piece_count: 1000 }),
  });
  expect(typeof body.specs.piece_count).toBe("number");
});
test("drop editor converts Guam time to UTC", async ({ page }, testInfo) => {
  await openSection(page, "Drops");
  await capture(page, "drops", testInfo.project.name);
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  await expect(page.getByLabel("Release · Guam time (ChST, UTC+10)")).toHaveValue("2026-12-05T10:00");
  await page.getByLabel("Release · Guam time (ChST, UTC+10)").fill("2026-12-06T11:30");
  const savedRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/admin/drops/drop-001-guahan-sunset-map") && request.method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save drop" }).click();
  expect((await savedRequest).postDataJSON().release_at).toBe("2026-12-06T01:30:00.000Z");
  await expect(page.getByText("Drop saved.")).toBeVisible();
  await capture(page, "drop-detail", testInfo.project.name);
});
test("clearing the release date previews and saves Coming soon", async ({ page }) => {
  await openSection(page, "Drops");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  await page.getByLabel(/Release · Guam time/).fill("");
  await expect(page.locator(".admin-meta").getByText(/coming.soon/i)).toBeVisible();
  await expect(page.getByText("Invalid release")).toHaveCount(0);
  const savedRequest = page.waitForRequest((request) => request.url().endsWith("/api/v1/admin/drops/drop-001-guahan-sunset-map") && request.method() === "PATCH");
  await page.getByRole("button", { name: "Save drop" }).click();
  expect((await savedRequest).postDataJSON().release_at).toBeNull();
  await expect(page.getByText("Drop saved.")).toBeVisible();
});
test("a name-only drop edit does not resend a timestamp with truncated seconds", async ({ page }) => {
  await openSection(page, "Drops");
  await page.getByRole("link", { name: "Guåhan Sunset Map" }).first().click();
  await page.getByLabel("Name").fill("Guåhan Sunset Map — Holiday");
  const savedRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/admin/drops/drop-001-guahan-sunset-map") &&
      request.method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save drop" }).click();
  expect((await savedRequest).postDataJSON()).toEqual({ name: "Guåhan Sunset Map — Holiday" });
});
test("subscribers can be viewed and CSV downloaded", async ({ page }, testInfo) => {
  await openSection(page, "Subscribers");
  await expect(
    page.locator(".admin-content").getByText("fan@example.com").filter({ visible: true })
  ).toBeVisible();
  await capture(page, "subscribers", testInfo.project.name);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("subscribers.csv");
});
test("admin invitation can be sent", async ({ page }, testInfo) => {
  await openSection(page, "Admins");
  await capture(page, "admins", testInfo.project.name);
  await page.getByLabel("Email").fill("newadmin@example.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("newadmin@example.com")).toBeVisible();
});
test("403 blocks every protected page", async ({ page }, testInfo) => {
  await page.goto("/admin/orders?mockAdmin=forbidden");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orders" })).toHaveCount(0);
  await capture(page, "access-denied", testInfo.project.name);
});
test("401 offers refresh and sign in again", async ({ page }, testInfo) => {
  await page.goto("/admin/orders?mockAdmin=expired");
  await expect(page.getByRole("heading", { name: "Session expired" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh session" })).toBeVisible();
  await capture(page, "session-expired", testInfo.project.name);
});
test("a signed-out invitation renders sign-up without dropping its ticket", async ({ page }) => {
  await page.goto("/admin/sign-up?__clerk_ticket=invite_signed_out&mockAuth=signed-out&mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Create your admin account" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("__clerk_ticket")).toBe("invite_signed_out");
});
test("an active session must sign out before accepting an invitation", async ({ page }, testInfo) => {
  await page.goto("/admin/sign-up?__clerk_ticket=invite_active&mockAdmin=ok");
  await expect(page.getByRole("heading", { name: "Sign out to accept this invitation" })).toBeVisible();
  await expect(page.getByText(/signed in as/)).toContainText("admin@example.com");
  await capture(page, "sign-up-active-session", testInfo.project.name);
  await page.getByRole("button", { name: "Sign out and continue" }).click();
  await expect(page.getByRole("heading", { name: "Create your admin account" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("__clerk_ticket")).toBe("invite_active");
});
test("collapsed sidebar links keep accessible names and visible focus tooltips", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sidebar behavior");
  const toggle = page.getByRole("button", { name: "Collapse sidebar" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  const orders = page.getByRole("link", { name: "Orders", exact: true });
  await orders.focus();
  await expect(page.getByRole("tooltip", { name: "Orders" })).toBeVisible();
  await capture(page, "collapsed-sidebar", testInfo.project.name);
});
test("every mobile drawer close path restores focus to its trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile drawer behavior");
  const trigger = page.getByRole("button", { name: "Open menu" });

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator(".admin-scrim").click({ position: { x: 380, y: 820 } });
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator(".admin-close").click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("navigation").getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders/);
  await expect(trigger).toBeFocused();
});
