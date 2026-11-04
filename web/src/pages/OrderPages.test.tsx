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
