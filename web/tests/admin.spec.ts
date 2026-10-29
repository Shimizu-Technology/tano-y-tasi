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
  await capture(page, "order-detail", testInfo.project.name);
  await page.getByLabel("Tracking number").fill("GU12345");
  await page.getByRole("button", { name: "Fulfill order" }).click();
  await expect(page.getByText("Tracking: GU12345")).toBeVisible();
  await page.getByRole("link", { name: "← Orders" }).click();
  await expect(page).toHaveURL(/status=paid/);
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
