import { expect, type Locator, type Page } from "@playwright/test";

export const GUAM = { name: "Mina Cruz", line1: "123 Marine Corps Drive", city: "Hagåtña", state: "GU", zip: "96910" };

export async function fillAddress(scope: Page | Locator, address: { name: string; line1: string; city: string; state: string; zip: string } = GUAM) {
  await scope.getByLabel("Full name").fill(address.name);
  await scope.getByLabel("Address", { exact: true }).fill(address.line1);
  await scope.getByLabel("City").fill(address.city);
  await scope.getByLabel("State or territory").selectOption(address.state);
  await scope.getByLabel("ZIP code").fill(address.zip);
}
// From the cart step to the shipping options, as a customer would.
export async function toShippingOptions(page: Page, email = "qa@example.com", address = GUAM) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "CHECKOUT", exact: true }).click();
  await fillAddress(page, address);
  await page.getByRole("button", { name: "SEE SHIPPING OPTIONS", exact: true }).click();
  await expect(page.getByRole("group", { name: "Choose how to get it" })).toBeVisible();
}
export async function submitCheckout(page: Page, email = "qa@example.com", address = GUAM) {
  await toShippingOptions(page, email, address);
  await page.getByRole("button", { name: "CONTINUE TO PAYMENT", exact: true }).click();
}
