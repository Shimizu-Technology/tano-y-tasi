import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OrderSummary } from "./OrderPages";
import { catalog, CORE, MAP } from "../mocks/data";
import type { Order } from "../types";

const [core] = catalog("live", { [CORE]: 40, [MAP]: 100 });
const line = { product_slug: CORE, name: core.name, quantity: 1, unit_price_cents: 3500, image: core.image };
const order: Order = { token: "t", number: "TYT-100001", status: "paid", email_masked: "a•••@example.com", subtotal_cents: 7000, total_cents: 7000, currency: "USD", created_at: "2026-11-04T00:00:00Z", paid_at: "2026-11-04T00:00:00Z", expires_at: "2026-11-04T00:30:00Z",
  items: [{ ...line, preorder_ships: "Ships late January 2027" }, { ...line, product_slug: "other", preorder_ships: null }] };

it("marks only the preorder line with its ship date", () => {
  render(<MemoryRouter><OrderSummary order={order} /></MemoryRouter>);
  expect(screen.getByText("Ships late January 2027")).toBeVisible();
  expect(screen.getAllByText("Preorder.")).toHaveLength(1);
});

it("shows shipping and tax as lines, with tax in the total", () => {
  render(<MemoryRouter><OrderSummary order={{ ...order, shipping_cents: 820, tax_cents: 344, total_cents: 7820, shipping_method: { label: "USPS Ground Advantage" } }} /></MemoryRouter>);
  expect(screen.getByText("Shipping (USPS Ground Advantage)")).toBeVisible();
  expect(screen.getByText("$8.20")).toBeVisible();
  expect(screen.getByText("Tax")).toBeVisible();
  expect(screen.getByText("$3.44")).toBeVisible();
  expect(screen.getByText("$81.64")).toBeVisible();
});

it("shows pickup instead of shipping, with its instructions", () => {
  render(<MemoryRouter><OrderSummary order={{ ...order, shipping_cents: 0, fulfillment_method: "pickup", shipping_method: { label: "Pick up in Guam", instructions: "Tumon, weekdays." } }} /></MemoryRouter>);
  expect(screen.getByText("Pick up in Guam")).toBeVisible();
  expect(screen.getByText("Free")).toBeVisible();
  expect(screen.getByText("Tumon, weekdays.")).toBeVisible();
});

it("keeps one total line for an order from before shipping", () => {
  render(<MemoryRouter><OrderSummary order={order} /></MemoryRouter>);
  expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
  expect(screen.getByText("$70")).toBeVisible();
});
