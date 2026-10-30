import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LookHome } from "./LookHome";
import { catalog, CORE, MAP, dropSummary } from "../mocks/data";
import type { Look } from "./look";
import type { Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const withMapDrop: Storefront = {
  featured_drop: { ...dropSummary("upcoming"), product: products[1] },
  core_products: [products[0]],
  server_time: "2026-10-29T00:00:00Z",
};
function show(look: Look, data: Storefront) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><LookHome look={look} data={data} story="Story" /></MemoryRouter>
    </QueryClientProvider>
  );
}

it("Look 5 leads with the live village map when the map drop is featured", () => {
  const { container } = show("5", withMapDrop);
  expect(container.querySelector(".look5-map-hero .village-finder-hero")).not.toBeNull();
  expect(container.querySelector(".look5-map-hero .village-finder-map")).toHaveAttribute("loading", "eager");
});

it("Look 5 falls back to Look 4's photo hero without a featured map drop", () => {
  const { container } = show("5", { ...withMapDrop, featured_drop: null });
  expect(container.querySelector(".look5-map-hero")).toBeNull();
  expect(container.querySelector(".sunhill-serif-hero .sunhill-art img")).not.toBeNull();
});

it("Look 4 keeps its photo hero and has no village map", () => {
  const { container } = show("4", withMapDrop);
  expect(container.querySelector(".look5-map-hero")).toBeNull();
  expect(container.querySelector(".village-finder")).toBeNull();
});
