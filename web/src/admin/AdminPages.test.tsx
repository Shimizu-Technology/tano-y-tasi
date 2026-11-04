import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShippingAddress, productForm, productPatch } from "./AdminPages";
import type { AdminProduct, OrderShipping } from "./adminApi";

describe("order shipping address", () => {
  it("renders the serializer's nested Stripe-shaped shipping fixture as address lines", () => {
    const shipping: OrderShipping = {
      name: "Example Buyer",
      phone: "+1 671 555 0100",
      address: {
        line1: "123 Marine Drive",
        line2: "Unit 4",
        city: "Hagåtña",
        state: "GU",
        postal_code: "96910",
        country: "US",
      },
    };

    render(<ShippingAddress shipping={shipping} />);

    expect(screen.getByText("Example Buyer")).toBeVisible();
    expect(screen.getByText("123 Marine Drive")).toBeVisible();
    expect(screen.getByText("Unit 4")).toBeVisible();
    expect(screen.getByText("Hagåtña, GU, 96910")).toBeVisible();
    expect(screen.getByText("US")).toBeVisible();
    expect(screen.getByText("+1 671 555 0100")).toBeVisible();
  });

  it("omits missing parts without printing empty separators", () => {
    render(<ShippingAddress shipping={{ name: "M. Cruz", address: { city: "Tamuning", country: "GU" } }} />);

    expect(screen.getByText("M. Cruz")).toBeVisible();
    expect(screen.getByText("Tamuning")).toBeVisible();
    expect(screen.getByText("GU")).toBeVisible();
  });
});

describe("product spec editing", () => {
  const product = {
    slug: "map",
    name: "Map",
    summary: "s",
    description: "d",
    price_cents: 4500,
    status: "active",
    position: 1,
    currency: "USD",
    stock_quantity: 100,
    kind: "drop",
    specs: { piece_count: 500, dimensions: { width: 16, height: 20 }, tags: ["map", "guam"], box: null, glossy: false, cut: "Classic" },
    includes: [],
    art: { credit: "", story: "" },
    placeholders: [],
    images: [],
  } as AdminProduct;

  it("round-trips objects, arrays, null, numbers, booleans and strings when one spec changes", () => {
    const initial = productForm(product);
    const form = { ...initial, specs: initial.specs.map((row) => (row.key === "piece_count" ? { ...row, value: "1000" } : row)) };
    expect(productPatch(form, initial)).toEqual({
      specs: { piece_count: 1000, dimensions: { width: 16, height: 20 }, tags: ["map", "guam"], box: null, glossy: false, cut: "Classic" },
    });
  });

  it("omits specs entirely when only the price changes", () => {
    const initial = productForm(product);
    expect(productPatch({ ...initial, price: "50.00" }, initial)).toEqual({ price_cents: 5000 });
  });

  it("sends the placeholder list only when it really changes, keeping unknown keys", () => {
    const initial = productForm({ ...product, placeholders: ["price_cents", "future.thing"] });
    expect(productPatch({ ...initial, placeholders: ["future.thing", "price_cents"] }, initial)).toEqual({});
    expect(productPatch({ ...initial, placeholders: ["future.thing"] }, initial)).toEqual({ placeholders: ["future.thing"] });
  });

  it("saves an edited structured value as parsed JSON and supports deleting a spec", () => {
    const initial = productForm(product);
    const specs = initial.specs
      .filter((row) => row.key !== "tags")
      .map((row) => (row.key === "dimensions" ? { ...row, value: '{"width":18,"height":24}' } : row));
    const patch = productPatch({ ...initial, specs }, initial) as { specs: Record<string, unknown> };
    expect(patch.specs.dimensions).toEqual({ width: 18, height: 24 });
    expect(patch.specs).not.toHaveProperty("tags");
  });
});
