import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fillAddress, GUAM, submitCheckout, toShippingOptions } from "./checkoutFlow";

const capture = async (page: Page, name: string, project: string) => {
  await mkdir(".screenshots", { recursive: true });
  await page.waitForTimeout(260);
  await page.screenshot({ path: `.screenshots/shipping-${project}-${name}.png` });
};
const fits = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const dialog = page.locator(".cart-dialog");
  if (await dialog.count()) {
    const inner = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(inner).toBeLessThanOrEqual(0);
  }
};
async function startCart(page: Page, mode = "flat", path = "/products/hafa-adai-from-tumon-bay") {
  await page.goto(`${path}?mockDrop=live&mockShipping=${mode}`);
  await page.getByRole("button", { name: "ADD TO CART", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
}
const cartDialog = (page: Page) => page.getByRole("dialog", { name: "Your cart" });
const payAndConfirm = async (page: Page) => {
  await page.getByRole("button", { name: "CONTINUE TO PAYMENT", exact: true }).click();
  await expect(page.getByText("TEST MODE · SIMULATED PAYMENT")).toBeVisible();
  await page.getByRole("button", { name: "Pay (test)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
};

test("a Guam customer checks out with shipping, and every step fits", async ({ page }, info) => {
  const project = info.project.name;
  await startCart(page);
  const cart = cartDialog(page);
  await expect(cart.getByText("Shipping is calculated next, from your address.")).toBeVisible();
  await capture(page, "1-cart", project);
  await cart.getByLabel("Email address", { exact: true }).fill("guam@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(cart.getByRole("heading", { name: "SHIPPING ADDRESS" })).toBeFocused();
  await expect(cart.getByLabel("Address", { exact: true })).toHaveAttribute("autocomplete", "shipping address-line1");
  await expect(cart.getByLabel("ZIP code")).toHaveAttribute("autocomplete", "shipping postal-code");
  await expect(cart.getByLabel("ZIP code")).toHaveAttribute("inputmode", "numeric");
  await capture(page, "2-address-empty", project);
  await fits(page);
  await fillAddress(cart);
  await capture(page, "3-address-filled", project);
  await cart.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  const options = cart.getByRole("group", { name: "Choose how to get it" });
  await expect(options.getByRole("radio", { name: /Standard/ })).toBeChecked();
  await expect(cart.getByText("Mina Cruz, 123 Marine Corps Drive, Hagåtña, GU 96910")).toBeVisible();
  await expect(cart.locator(".price-lines")).toContainText("Shipping");
  await expect(cart.locator(".price-lines")).toContainText("$12");
  await expect(cart.locator(".subtotal")).toContainText("Total");
  await capture(page, "4-options", project);
  await fits(page);
  await payAndConfirm(page);
  await expect(page.locator(".price-lines")).toContainText("Shipping (Standard)");
  await expect(page.locator(".order-totals .subtotal")).toContainText("$47");
  await capture(page, "5-confirmation", project);
  await fits(page);
  await page.reload();
  await expect(page.locator(".price-lines")).toContainText("Shipping (Standard)");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("Marine Corps");
  expect(await page.evaluate(() => sessionStorage.getItem("tyt-shipping-address"))).toBeNull();
});

test("a military address asks for APO, FPO or DPO, then checks out", async ({ page }, info) => {
  await startCart(page);
  const cart = cartDialog(page);
  await cart.getByLabel("Email address", { exact: true }).fill("military@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await fillAddress(cart, { name: "Sgt Cruz", line1: "PSC 455 Box 12", city: "San Diego", state: "AP", zip: "96540" });
  await expect(cart.getByText("For a military address, use APO, FPO or DPO.")).toBeVisible();
  await cart.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  await expect(cart.getByText("For a military address, the city is APO, FPO or DPO.")).toBeVisible();
  await expect(cart.getByLabel("City")).toHaveAttribute("aria-invalid", "true");
  await capture(page, "military-error", info.project.name);
  await cart.getByLabel("City").fill("FPO");
  await cart.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  await expect(cart.getByText("Sgt Cruz, PSC 455 Box 12, FPO, AP 96540")).toBeVisible();
  await expect(cart.locator(".price-lines")).toContainText("$12");
  await payAndConfirm(page);
});

test("a wrong ZIP for the state gets a plain error, and nothing typed is lost", async ({ page }) => {
  await startCart(page);
  const cart = cartDialog(page);
  await cart.getByLabel("Email address", { exact: true }).fill("zip@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await fillAddress(cart, { ...GUAM, zip: "90210" });
  await cart.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  await expect(cart.getByText("Guam ZIP codes run from 96910 to 96932.")).toBeVisible();
  await expect(cart.getByLabel("Full name")).toHaveValue("Mina Cruz");
});

test("back never loses the cart or the address, and closing keeps both", async ({ page }) => {
  await startCart(page);
  const cart = cartDialog(page);
  await toShippingOptions(page, "back@example.com");
  await cart.getByRole("button", { name: "BACK" }).click();
  await expect(cart.getByLabel("Address", { exact: true })).toHaveValue(GUAM.line1);
  await cart.getByRole("button", { name: "BACK" }).click();
  await expect(cart.getByRole("heading", { name: /YOUR CART/ })).toBeVisible();
  await expect(cart.getByLabel("Email address", { exact: true })).toHaveValue("back@example.com");
  await cart.getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.getByRole("button", { name: "CART (1)" }).click();
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(cart.getByLabel("Address", { exact: true })).toHaveValue(GUAM.line1);
});

test("changing the cart after a quote asks for fresh options", async ({ page }) => {
  await startCart(page);
  const cart = cartDialog(page);
  await toShippingOptions(page, "changed@example.com");
  await cart.getByRole("button", { name: "BACK" }).click();
  await cart.getByRole("button", { name: "BACK" }).click();
  await cart.getByRole("button", { name: /Increase quantity/ }).click();
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await expect(cart.getByRole("heading", { name: "SHIPPING ADDRESS" })).toBeVisible();
  await cart.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  await expect(cart.locator(".subtotal")).toContainText("$82");
});

test("live rates can be compared, and a changed option changes the total", async ({ page }, info) => {
  await startCart(page, "live");
  const cart = cartDialog(page);
  await toShippingOptions(page, "live@example.com");
  await expect(cart.getByRole("radio", { name: /USPS Ground Advantage/ })).toBeChecked();
  await expect(cart.getByText("About 5 business days after it ships")).toBeVisible();
  await expect(cart.locator(".subtotal")).toContainText("$45.50");
  await cart.getByText("USPS Priority").click();
  await expect(cart.locator(".subtotal")).toContainText("$54");
  await capture(page, "live-options", info.project.name);
  await fits(page);
  await payAndConfirm(page);
  await expect(page.locator(".price-lines")).toContainText("Shipping (USPS Priority)");
});

test("EasyPost being down still lets the customer buy at the flat rate", async ({ page }) => {
  await startCart(page, "down");
  const cart = cartDialog(page);
  await toShippingOptions(page, "down@example.com");
  await expect(cart.getByRole("radio", { name: /Standard/ })).toBeChecked();
  await expect(cart.locator(".price-lines")).toContainText("$12");
  await expect(cart.getByText(/EasyPost/)).toHaveCount(0);
  await payAndConfirm(page);
});

test("an expired quote is replaced, and the customer confirms before paying", async ({ page }, info) => {
  await startCart(page, "expired");
  const cart = cartDialog(page);
  await submitCheckout(page, "expired@example.com");
  await expect(cart.getByText("Shipping options were refreshed. Check the price, then continue.")).toBeVisible();
  await capture(page, "expired-quote", info.project.name);
  await payAndConfirm(page);
});

test("a Guam customer can pick up, and sees the instructions on the order", async ({ page }, info) => {
  await startCart(page, "pickup");
  const cart = cartDialog(page);
  await toShippingOptions(page, "pickup@example.com");
  await cart.getByText("Pick up in Guam").click();
  await expect(cart.getByRole("radio", { name: /Pick up in Guam/ })).toBeChecked();
  await expect(cart.getByText("Tumon, Guam. We'll email you when it's ready.")).toBeVisible();
  await expect(cart.locator(".price-lines")).toContainText("Free");
  await capture(page, "pickup-options", info.project.name);
  await payAndConfirm(page);
  await expect(page.getByText("Tumon, Guam. We'll email you when it's ready.")).toBeVisible();
  await expect(page.locator(".order-totals .subtotal")).toContainText("$35");
});

test("pickup isn't offered off-island", async ({ page }) => {
  await startCart(page, "pickup");
  const cart = cartDialog(page);
  await toShippingOptions(page, "hawaii@example.com", { name: "A Buyer", line1: "1 Ala Moana", city: "Honolulu", state: "HI", zip: "96815" });
  await expect(cart.getByRole("radio")).toHaveCount(1);
  await expect(cart.getByText("Pick up in Guam")).toHaveCount(0);
});

test("free shipping reads as free through to the order", async ({ page }) => {
  await startCart(page, "free");
  const cart = cartDialog(page);
  await toShippingOptions(page, "free@example.com");
  await expect(cart.locator(".shipping-option")).toContainText("Free");
  await expect(cart.locator(".subtotal")).toContainText("$35");
  await payAndConfirm(page);
  await expect(page.locator(".price-lines")).toContainText("Free");
});

test("the tax switch tells the customer tax comes at payment", async ({ page }) => {
  await startCart(page, "tax");
  const cart = cartDialog(page);
  await toShippingOptions(page, "tax@example.com");
  await expect(cart.locator(".price-lines")).toContainText("Added at payment");
  await expect(cart.locator(".subtotal")).toContainText("Total before tax");
});

test("a store that closes mid-checkout sends the customer back to a clear message", async ({ page }) => {
  await startCart(page);
  const cart = cartDialog(page);
  await cart.getByLabel("Email address", { exact: true }).fill("closed@example.com");
  await cart.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await fillAddress(cart);
  // The merchant closes the store while the customer is typing.
  await page.evaluate(() => sessionStorage.setItem("tyt-mock-store", "closed"));
  await page.reload();
  await page.getByRole("button", { name: "CART (1)" }).click();
  await expect(cart.getByText("This item is currently unavailable.")).toBeVisible();
  await expect(cart.getByRole("button", { name: "CHECKOUT", exact: true })).toBeDisabled();
});

test("the merchant sets rates, sees placeholders until saved, and buys a label with a price check", async ({ page }, info) => {
  const project = info.project.name;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/store?mockAdmin=ok&mockEasyPost=1");
  await expect(page.getByText("Shipping rates are still placeholders.")).toBeVisible();
  await page.getByRole("link", { name: "Edit shipping and tax" }).click();
  await expect(page.getByRole("heading", { name: "Shipping and tax" })).toBeVisible();
  await expect(page.getByText("These are placeholder rates.")).toBeVisible();
  await expect(page.getByLabel("Mainland U.S. (USD)")).toHaveValue("8.00");
  await expect(page.getByLabel("Guam and CNMI (USD)")).toHaveValue("12.00");
  await page.screenshot({ path: `.screenshots/shipping-${project}-admin-settings.png`, fullPage: true });
  await page.getByLabel("Mainland U.S. (USD)").fill("nine");
  await page.getByRole("button", { name: "Save shipping and confirm these rates" }).click();
  await expect(page.getByText("Enter an amount like 8.00.")).toBeVisible();
  await page.getByLabel("Mainland U.S. (USD)").fill("9.50");
  await page.getByLabel("Offer free pickup in Guam").check();
  await page.getByRole("button", { name: "Save shipping and confirm these rates" }).click();
  await expect(page.getByText("Must say where and when to pick up")).toBeVisible();
  await page.getByLabel("Pickup instructions").fill("Tumon, weekdays.");
  await page.getByRole("button", { name: "Save shipping and confirm these rates" }).click();
  await expect(page.getByText("Shipping saved. New checkouts use it right away.")).toBeVisible();
  await expect(page.getByText("These are placeholder rates.")).toHaveCount(0);
  await expect(page.getByLabel("Mainland U.S. (USD)")).toHaveValue("9.50");
  await expect(page.getByLabel("Collect tax at payment with Stripe Tax")).not.toBeChecked();
  await expect(page.getByText("Leave this off until Stripe Tax is set up")).toBeVisible();

  await page.goto("/admin/orders/TYT-100001");
  await expect(page.getByRole("heading", { name: "TYT-100001" })).toBeVisible();
  await expect(page.getByText("EasyPost was unavailable at checkout")).toBeVisible();
  await expect(page.locator(".admin-total").first()).toContainText("Subtotal");
  await page.getByRole("button", { name: "Buy label" }).click();
  await expect(page.getByRole("link", { name: "Print label" })).toHaveAttribute("href", "https://easypost-files.example/label.png");
  await expect(page.getByText("Tracking: 9400100000000000000000.")).toBeVisible();
  await expect(page.getByText("pre transit")).toBeVisible();
  await page.screenshot({ path: `.screenshots/shipping-${project}-admin-label.png`, fullPage: true });
  await page.getByRole("button", { name: "Mark fulfilled and email the customer" }).click();
  await expect(page.getByText("Tracking: 9400100000000000000000", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark fulfilled and email the customer" })).toHaveCount(0);
});

test("without EasyPost, an order keeps the manual tracking flow and no label button", async ({ page }) => {
  await page.goto("/admin/orders/TYT-100001?mockAdmin=ok&mockEasyPost=off");
  await expect(page.getByRole("heading", { name: "TYT-100001" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy label" })).toHaveCount(0);
  await page.getByLabel("Tracking number").fill("GU12345");
  await page.getByRole("button", { name: "Fulfill order" }).click();
  await expect(page.getByText("Tracking: GU12345")).toBeVisible();
});

test("the product editor keeps shipping measurements", async ({ page }) => {
  await page.goto("/admin/products/hafa-adai-from-tumon-bay?mockAdmin=ok");
  await page.getByLabel("Weight (oz)").fill("22.5");
  await page.getByLabel("Height (in)").fill("2");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("button", { name: "Save product" })).toBeDisabled();
  await expect(page.getByLabel("Weight (oz)")).toHaveValue("22.5");
});
