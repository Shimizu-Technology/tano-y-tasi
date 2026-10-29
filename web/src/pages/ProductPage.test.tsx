import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductPage } from "./ProductPage";
import { catalog, CORE, MAP } from "../mocks/data";

it("hides unknown specs while keeping confirmed details and factual shipping available", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  product.specs.box_size = "TBD";
  client.setQueryData(["product", CORE], { product, server_time: "2026-10-29T00:00:00Z" });
  try {
    const { container } = render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/products/${CORE}`]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
    expect(screen.getByText("Pieces")).toBeVisible();
    expect(screen.getByText("100", { exact: true })).toBeVisible();
    expect(screen.queryByText("Box size")).not.toBeInTheDocument();
    expect(screen.queryByText("Material")).not.toBeInTheDocument();
    expect(screen.queryByText(/Preview details/)).not.toBeInTheDocument();
    expect(container.querySelector(".product-state")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Shipping", { exact: true }));
    expect(screen.getByText("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico.")).toBeVisible();
    expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeEnabled();
  } finally {
    vi.unstubAllGlobals();
  }
});
