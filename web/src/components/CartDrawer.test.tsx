import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { CartDrawer } from "./CartDrawer";
import { useCart } from "../cart";
import { api, ApiError } from "../api";
import { readAttempt } from "../checkoutState";
import { configureMocks } from "../mocks/handlers";
import { CORE, MAP, PREORDER } from "../mocks/data";
function show(slug = CORE, quantity = 1) {
  useCart.getState().clear();
  useCart.getState().add(slug, quantity, 10);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CartDrawer onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return userEvent.setup();
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
type User = ReturnType<typeof userEvent.setup>;
async function fillAddress(user: User, values: Partial<Record<string, string>> = {}) {
  const { state = "GU", ...text } = values;
  const fields = { "Full name": "A Buyer", Address: "123 Marine Corps Drive", City: "Hagåtña", "ZIP code": "96910", ...text };
  for (const [label, value] of Object.entries(fields)) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    if (value) await user.type(input, value);
  }
  await user.selectOptions(screen.getByLabelText("State or territory"), state);
}
async function toOptions(user: User, values?: Partial<Record<string, string>>) {
  await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
  const button = screen.getByRole("button", { name: "CHECKOUT" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await fillAddress(user, values);
  await user.click(screen.getByRole("button", { name: "SEE SHIPPING OPTIONS" }));
  await screen.findByRole("group", { name: "Choose how to get it" });
}
async function submit(user: User) {
  await toOptions(user);
  await user.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT" }));
}
it("keeps a transient attempt and retries its last-unit reservation after refresh", async () => {
  configureMocks({
    state: "live",
    paymentFailures: ["same_key", "same_key"],
    database: { stock: { [CORE]: 1, [MAP]: 100 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 },
  });
  const checkout = vi.spyOn(api, "checkout");
  const user = show();
  await submit(user);
  const retry = await screen.findByRole("button", { name: "Try again" });
  const key = readAttempt()!.key;
  expect((await api.product(CORE)).product.availability.purchasable).toBe(false);
  expect(retry).toBeEnabled();
  await user.click(retry);
  await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
  expect(checkout.mock.calls[1][2]).toBe(key);
  expect(readAttempt()?.key).toBe(key);
});
it("replaces a definitively rejected attempt with a fresh checkout key", async () => {
  configureMocks({ paymentFailures: ["new_checkout", "same_key"] });
  const checkout = vi.spyOn(api, "checkout");
  const user = show();
  await submit(user);
  const retry = await screen.findByRole("button", { name: "Start a new checkout" });
  expect(readAttempt()).toBeNull();
  await waitFor(() => expect(retry).toBeEnabled());
  await user.click(retry);
  await screen.findByRole("button", { name: "Try again" });
  expect(checkout.mock.calls[1][2]).not.toBe(checkout.mock.calls[0][2]);
});
it("applies fresh-stock gating when the email changes", async () => {
  configureMocks({
    paymentFailures: ["same_key"],
    database: { stock: { [CORE]: 1, [MAP]: 100 }, orders: {}, attempts: {}, subscribers: [], sequence: 100000 },
  });
  const user = show();
  await submit(user);
  await screen.findByRole("button", { name: "Try again" });
  await user.click(screen.getByRole("button", { name: "BACK" }));
  await user.click(screen.getByRole("button", { name: "BACK" }));
  await user.clear(screen.getByLabelText("Email address"));
  await user.type(screen.getByLabelText("Email address"), "other@example.com");
  await waitFor(() => expect(screen.getByRole("button", { name: "CHECKOUT" })).toBeDisabled());
});
it("offers a safe single-line limit fix when older APIs omit product_slug", async () => {
  vi.spyOn(api, "checkout").mockRejectedValue(
    new ApiError(
      { code: "limit_exceeded", message: "Limit 2 per customer.", details: { limit: 2, already_purchased: 1 } },
      422
    )
  );
  const user = show(CORE, 2);
  await submit(user);
  await user.click(await screen.findByRole("button", { name: "Reduce to 1" }));
  expect(useCart.getState().items[0].quantity).toBe(1);
});
it("keeps the cart and shows a safe error for an untrusted payment URL", async () => {
  vi.spyOn(api, "checkout").mockResolvedValue({
    order: { token: "token", number: "TYT-100001", status: "pending_payment", expires_at: new Date().toISOString() },
    payment_url: "https://evil.example/pay",
  });
  const user = show();
  await submit(user);
  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t open a secure payment page.");
  expect(useCart.getState().items[0].quantity).toBe(1);
  expect(readAttempt()?.orderToken).toBe("token");
});
it("shows field errors without asking for a quote, then keeps what was typed", async () => {
  configureMocks();
  const quotes = vi.spyOn(api, "shippingQuotes");
  const user = show();
  await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
  await user.click(await screen.findByRole("button", { name: "CHECKOUT" }));
  await fillAddress(user, { "ZIP code": "90210" });
  await user.click(screen.getByRole("button", { name: "SEE SHIPPING OPTIONS" }));
  expect(screen.getByText("Guam ZIP codes run from 96910 to 96932.")).toBeVisible();
  expect(screen.getByLabelText("ZIP code")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Full name")).toHaveValue("A Buyer");
  expect(quotes).not.toHaveBeenCalled();
});
it("asks for APO, FPO or DPO as the city on a military address", async () => {
  configureMocks();
  const user = show();
  await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
  await user.click(await screen.findByRole("button", { name: "CHECKOUT" }));
  await fillAddress(user, { City: "San Diego", "ZIP code": "96201", state: "AP" });
  await user.click(screen.getByRole("button", { name: "SEE SHIPPING OPTIONS" }));
  expect(screen.getByText("For a military address, the city is APO, FPO or DPO.")).toBeVisible();
  await user.clear(screen.getByLabelText("City"));
  await user.type(screen.getByLabelText("City"), "FPO");
  await user.click(screen.getByRole("button", { name: "SEE SHIPPING OPTIONS" }));
  expect(await screen.findByRole("radio", { name: /Standard/ })).toBeChecked();
});
it("sends the chosen quote, and a different option starts a new attempt", async () => {
  configureMocks({ shipping: "live" });
  const checkout = vi.spyOn(api, "checkout").mockRejectedValue(new ApiError({ code: "payment_unavailable", message: "Payment is temporarily unavailable.", details: { retry: "same_key" } }, 503));
  const user = show();
  await toOptions(user);
  await user.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT" }));
  await screen.findByRole("button", { name: "Try again" });
  const first = readAttempt()!;
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", { name: "Try again" });
  expect(checkout.mock.calls[1][2]).toBe(first.key);
  expect(checkout.mock.calls[1][3]).toEqual(checkout.mock.calls[0][3]);
  await user.click(screen.getByRole("radio", { name: /USPS Priority/ }));
  await user.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT" }));
  await waitFor(() => expect(checkout).toHaveBeenCalledTimes(3));
  expect(checkout.mock.calls[2][2]).not.toBe(first.key);
  expect(checkout.mock.calls[2][3].quote).not.toBe(first.shipping!.option.quote);
});
it("re-quotes an expired quote and lets the customer confirm the new price", async () => {
  configureMocks({ shipping: "expired" });
  const quotes = vi.spyOn(api, "shippingQuotes");
  const user = show();
  await submit(user);
  expect(await screen.findByText("Shipping options were refreshed. Check the price, then continue.")).toBeVisible();
  expect(quotes).toHaveBeenCalledTimes(2);
  expect(readAttempt()).toBeNull();
});
it("returns to the cart with a clear message when the store closes during checkout", async () => {
  configureMocks();
  vi.spyOn(api, "shippingQuotes").mockRejectedValue(new ApiError({ code: "store_closed", message: "The store isn't open for orders yet. Join the list and you'll hear first." }, 422));
  const user = show();
  await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
  await user.click(await screen.findByRole("button", { name: "CHECKOUT" }));
  await fillAddress(user);
  await user.click(screen.getByRole("button", { name: "SEE SHIPPING OPTIONS" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The store isn't open for orders yet.");
  expect(screen.getByRole("heading", { name: /YOUR CART/ })).toBeVisible();
  expect(useCart.getState().items[0].quantity).toBe(1);
});
it("keeps the address out of localStorage", async () => {
  configureMocks();
  const user = show();
  await submit(user);
  await waitFor(() => expect(readAttempt()?.orderToken).toBeTruthy());
  const stored = Object.entries({ ...localStorage }).filter(([, value]) => value.includes("Marine Corps")).map(([key]) => key);
  expect(stored).toEqual([]);
  expect(sessionStorage.getItem("tyt-shipping-address")).toContain("Marine Corps");
});
it("labels a preorder line with its ship date, and warns only when the cart is mixed", async () => {
  configureMocks({ state: "live", extras: { preorder: true } });
  const alone = show(PREORDER, 1);
  expect(await screen.findByText("Ships late January 2027")).toBeVisible();
  expect(screen.queryByText(/may ship together/)).not.toBeInTheDocument();
  void alone;
  useCart.getState().add(CORE, 1, 10);
  expect(await screen.findByText(/your whole order may ship together/)).toBeVisible();
  expect(screen.getAllByText("Preorder.")).toHaveLength(1);
});
