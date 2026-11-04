import { paymentRedirect } from "./paymentRedirect";
afterEach(() => vi.unstubAllEnvs());
it("allows only the Stripe HTTPS checkout host in production", () => {
  vi.stubEnv("DEV", false);
  expect(paymentRedirect("https://checkout.stripe.com/c/pay/cs_test")).toBe(
    "https://checkout.stripe.com/c/pay/cs_test"
  );
  for (const url of [
    "https://evil.example/pay",
    "http://checkout.stripe.com/pay",
    "https://checkout.stripe.com.evil.example/pay",
    "https://checkout.stripe.com@evil.example/pay",
    "https://user@checkout.stripe.com/pay",
    "https://checkout.stripe.com:444/pay",
    "javascript:alert(1)",
    "/checkout/simulated/order-token",
    "http://[",
    "//evil.example/pay",
  ])
    expect(paymentRedirect(url), url).toBeNull();
});
it("allows the exact same-origin simulated route only in development", () => {
  vi.stubEnv("DEV", true);
  expect(paymentRedirect("/checkout/simulated/order-token")).toBe(`${location.origin}/checkout/simulated/order-token`);
  expect(paymentRedirect(`${location.origin}/checkout/simulated/token`)).toBe(
    `${location.origin}/checkout/simulated/token`
  );
  for (const url of [
    "https://evil.example/checkout/simulated/token",
    "/checkout/simulated/token/extra",
    "/checkout/simulated/token?redirect=evil",
    "/shop",
    "/checkout/simulated/",
  ])
    expect(paymentRedirect(url), url).toBeNull();
});

it("allows only this site's own order page for an order with nothing to charge", () => {
  const origin = window.location.origin;
  expect(paymentRedirect(`${origin}/orders/abc_123?from=checkout`)).toBe(`${origin}/orders/abc_123?from=checkout`);
  expect(paymentRedirect(`https://evil.example/orders/abc?from=checkout`)).toBeNull();
  expect(paymentRedirect(`${origin}/orders/abc?next=https://evil.example`)).toBeNull();
  expect(paymentRedirect(`${origin}/admin?from=checkout`)).toBeNull();
});
