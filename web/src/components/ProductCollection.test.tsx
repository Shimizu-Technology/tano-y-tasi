import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductCollection } from "./ProductCollection";
import { catalog, CORE, MAP } from "../mocks/data";
const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
function show(count: number) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProductCollection products={Array.from({ length: count }, (_, i) => ({ ...product, slug: i ? `mock-${i}` : CORE }))} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
it("features a single puzzle with price, summary, real specs and a product action", async () => {
  const { container } = show(1);
  expect(container.querySelector(".collection-feature")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: product.name })).toBeVisible();
  expect(screen.getByText("$35")).toBeVisible();
  expect(screen.getByText(product.summary)).toBeVisible();
  expect(await screen.findByText("100 pieces · 12 × 9 in finished")).toBeVisible();
  expect(screen.getByRole("link", { name: "VIEW DETAILS" })).toHaveAttribute("href", `/products/${CORE}`);
});
it.each([2, 3, 4])("selects the pair/grid layout for %i products", (count) => {
  const { container } = show(count);
  expect(container.querySelector(count === 2 ? ".collection-pair" : ".collection-grid")).toBeInTheDocument();
  expect(container.querySelectorAll(".product-card")).toHaveLength(count);
  expect(container.querySelector(".collection-feature")).not.toBeInTheDocument();
});
