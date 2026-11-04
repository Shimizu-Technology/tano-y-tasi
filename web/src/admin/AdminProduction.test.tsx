import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ProductionRuns } from "./AdminProduction";
import { AdminApiContext, createAdminClient, type AdminProduct } from "./adminApi";
import { configureAdminMocks, mockAdminProducts } from "../mocks/adminHandlers";
import { CORE } from "../mocks/data";

const client = createAdminClient(async () => "tyt-admin-test-auth");
const dirtyReports = vi.fn();
function show(reload = vi.fn()) {
  const product = mockAdminProducts().find((item) => item.slug === CORE) as AdminProduct;
  render(
    <MemoryRouter>
      <AdminApiContext.Provider value={client}>
        <ProductionRuns product={product} reload={reload} onDirty={dirtyReports} />
      </AdminApiContext.Provider>
    </MemoryRouter>
  );
  return { user: userEvent.setup(), product, reload };
}
beforeEach(() => configureAdminMocks());
afterEach(() => vi.restoreAllMocks());

async function addRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add a run" }));
  await user.type(screen.getByLabelText("Units ordered"), "500");
  await user.type(screen.getByLabelText("Cost per unit (USD)"), "7");
  await user.type(screen.getByLabelText("Supplier"), "Shenzhen Puzzle Co");
  await user.type(screen.getByLabelText("Expected date"), "2027-01-15");
  await user.click(screen.getByRole("button", { name: "Save run" }));
  return screen.findByText("500 units");
}

it("records a run with its date, cost and margin, without touching stock", async () => {
  const { user, product } = show();
  expect(await screen.findByText("No production runs yet.")).toBeVisible();
  await addRun(user);
  expect(screen.getByText("Jan 15, 2027")).toBeVisible();
  expect(screen.getByText("$7.00")).toBeVisible();
  expect(screen.getByText(/80% margin/)).toBeVisible();
  expect(screen.getByText("Shenzhen Puzzle Co")).toBeVisible();
  expect(product.stock_quantity).toBe(40);
});

it("tells the editor about unsaved run details", async () => {
  const { user } = show();
  await user.click(await screen.findByRole("button", { name: "Add a run" }));
  expect(dirtyReports).toHaveBeenLastCalledWith(false);
  await user.type(screen.getByLabelText("Units ordered"), "5");
  expect(dirtyReports).toHaveBeenLastCalledWith(true);
});

it("checks the form before saving", async () => {
  const { user } = show();
  await user.click(await screen.findByRole("button", { name: "Add a run" }));
  await user.click(screen.getByRole("button", { name: "Save run" }));
  expect(screen.getByLabelText(/Units ordered/)).toHaveAttribute("aria-invalid", "true");
});

it("receives once, defaulting to the quantity, and offers no second receive", async () => {
  const { user, reload } = show();
  const card = (await addRun(user)).closest("li")!;
  await user.click(within(card).getByRole("button", { name: "Receive" }));
  expect(within(card).getByLabelText("Units to add to stock")).toHaveValue(500);
  await user.dblClick(within(card).getByRole("button", { name: "Confirm received" }));
  expect(await screen.findByText("Received. 500 units added to stock.")).toBeVisible();
  expect(mockAdminProducts().find((item) => item.slug === CORE)!.stock_quantity).toBe(540);
  await waitFor(() => expect(within(screen.getByRole("list")).queryByRole("button", { name: "Receive" })).not.toBeInTheDocument());
  expect(reload).toHaveBeenCalled();
});

it("takes zero when the units were already allotted to preorders", async () => {
  const { user } = show();
  const card = (await addRun(user)).closest("li")!;
  await user.click(within(card).getByRole("button", { name: "Receive" }));
  const count = within(card).getByLabelText("Units to add to stock");
  await user.clear(count);
  await user.type(count, "501");
  await user.click(within(card).getByRole("button", { name: "Confirm received" }));
  expect(within(card).getByLabelText(/Units to add to stock/)).toHaveAttribute("aria-invalid", "true");
  await user.clear(count);
  await user.type(count, "0");
  await user.click(within(card).getByRole("button", { name: "Confirm received" }));
  expect(await screen.findByText("Received. Stock is unchanged.")).toBeVisible();
  expect(mockAdminProducts().find((item) => item.slug === CORE)!.stock_quantity).toBe(40);
});

it("edits and cancels a run, and leaves a canceled run read-only", async () => {
  const { user } = show();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const card = (await addRun(user)).closest("li")!;
  await user.click(within(card).getByRole("button", { name: "Edit" }));
  const quantity = screen.getByLabelText("Units ordered");
  await user.clear(quantity);
  await user.type(quantity, "450");
  await user.click(screen.getByRole("button", { name: "Save run" }));
  const edited = (await screen.findByText("450 units")).closest("li")!;
  await user.click(within(edited).getByRole("button", { name: "Cancel run" }));
  expect(await screen.findByText("Run canceled.")).toBeVisible();
  await waitFor(() => expect(within(edited).queryByRole("button")).not.toBeInTheDocument());
  expect(within(edited).getByText("canceled")).toBeVisible();
});
