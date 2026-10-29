import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home, Info, Shop } from "./StorePages";
import { catalog, CORE, MAP, dropSummary } from "../mocks/data";
import type { Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const storefront: Storefront = {
  featured_drop: { ...dropSummary("upcoming"), product: products[1] },
  core_products: [products[0]],
  server_time: "2026-10-29T00:00:00Z",
};
function show(path: string, data = storefront) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["storefront"], data);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/info/:topic" element={<Info />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
it("explains the featured art and links to the first buyable core puzzle at its actual price", () => {
  show("/", { ...storefront, core_products: [
    { ...products[0], availability: { ...products[0].availability, purchasable: false } },
    { ...products[0], slug: "available-puzzle", name: "Available puzzle", price_cents: 4175 },
  ] });
  expect(screen.getByText(products[1].summary)).toBeVisible();
  expect(screen.getByText("Drop 001 · Releases Sat, Dec 5 · 10:00 AM ChST")).toBeVisible();
  expect(screen.getByRole("link", { name: "Shop Available puzzle — $41.75" })).toHaveAttribute("href", "/products/available-puzzle");
  expect(screen.getByRole("link", { name: "NOTIFY ME" })).toHaveAttribute("href", "/drop#notify");
});
it("omits a buyable core link when every core puzzle is unavailable", () => {
  show("/", { ...storefront, core_products: [] });
  expect(screen.queryByRole("link", { name: /Shop .* —/ })).not.toBeInTheDocument();
});
it.each([1, 2])("uses a plain Shop heading and a meaningful count for %i products", (count) => {
  show("/shop", { ...storefront, core_products: products.slice(0, count) });
  expect(screen.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
  expect(screen.getByText(`${count} ${count === 1 ? "puzzle" : "puzzles"}`)).toBeVisible();
});
it("answers FAQ release times and limits from the current payload", () => {
  show("/info/faq", { ...storefront, featured_drop: { ...storefront.featured_drop!, number: 7, per_customer_limit: 3 } });
  expect(screen.getByText(/Drop 007 releases Sat, Dec 5, 10:00 AM ChST/)).toHaveTextContent("Fri, Dec 4, 4:00 PM PT · Fri, Dec 4, 2:00 PM HT");
  expect(screen.getByText("Drop 007 is limited to 3 per customer.")).toBeVisible();
  expect(screen.getByText("No. Drops are one-time releases and never restock.")).toBeVisible();
  expect(screen.getByText(/about 30 minutes/)).toBeVisible();
});
it("does not invent a release or a customer limit without an announced drop", () => {
  show("/info/faq", { ...storefront, featured_drop: null });
  expect(screen.getByText("The next release has not been announced.")).toBeVisible();
  expect(screen.queryByText(/limited to/)).not.toBeInTheDocument();
});
it("publishes only the known shipping calculation and destinations", () => {
  show("/info/shipping");
  expect(screen.getByText("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico.")).toBeVisible();
  expect(screen.queryByText(/placeholder|returns policy/i)).not.toBeInTheDocument();
});
