import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShippingAddress } from "./AdminPages";
import type { OrderShipping } from "./adminApi";

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
