import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LookHome } from "./LookHome";
import { catalog, CORE, MAP, dropSummary } from "../mocks/data";
import type { Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const withDrop: Storefront = {
  featured_drop: { ...dropSummary("upcoming"), product: products[1] },
  core_products: [products[0]],
  server_time: "2026-10-29T00:00:00Z",
};
function show(data: Storefront) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><LookHome look="5" data={data} story="Story" /></MemoryRouter>
    </QueryClientProvider>
  );
}

it("links the village teaser straight to the map drop's finder", () => {
  show(withDrop);
  expect(screen.getByRole("link", { name: "Find yours" })).toHaveAttribute(
    "href",
    `/drops/${withDrop.featured_drop!.slug}#find-your-village`
  );
});

it("hides the village teaser when no map drop is featured", () => {
  show({ ...withDrop, featured_drop: null });
  expect(screen.queryByRole("heading", { name: "Find your village" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Find yours" })).not.toBeInTheDocument();
});
