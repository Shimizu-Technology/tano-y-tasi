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
async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email address"), "buyer@example.com");
  const button = screen.getByRole("button", { name: "CHECKOUT" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
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
