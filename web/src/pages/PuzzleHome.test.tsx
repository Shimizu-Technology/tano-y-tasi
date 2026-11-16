import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PuzzleHome } from "./PuzzleHome";
import { brand } from "../brand";
import { catalog, CORE, MAP, dropSummary } from "../mocks/data";
import type { DropState, Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const featured = (state: DropState): Storefront["featured_drop"] => ({ ...dropSummary(state), product: products[1] });
const storefront = (drop: Storefront["featured_drop"]): Storefront => ({ featured_drop: drop, core_products: [products[0]], server_time: "2026-10-29T00:00:00Z" });
function show(data?: Storefront) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (data) client.setQueryData(["storefront"], data);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Routes><Route path="/" element={<PuzzleHome />} /></Routes></MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

// jsdom draws no canvas, so these cover the finished-map hero every browser falls back to; the
// browser tests (tests/puzzle-home.spec.ts) cover the pieces coming together.
it("leads with the tagline, the mission, the finished map and the way to shop, in every drop state", () => {
  for (const drop of [null, featured("upcoming"), featured("live"), featured("sold_out")]) {
    const view = show(storefront(drop));
    const hero = view.container.querySelector<HTMLElement>(".puzzle-hero")!;
    expect(hero).toHaveAttribute("data-mode", "still");
    expect(within(hero).getByRole("heading", { level: 1 })).toHaveTextContent(brand.tagline);
    expect(within(hero).getByText(brand.mission[0])).toBeVisible();
    expect(within(hero).getByRole("img", { name: /Illustrated map of Guåhan/ })).toHaveAttribute("src", expect.stringContaining("guahan-sunset-map/artwork"));
    expect(within(hero).getByRole("link", { name: /SHOP THE COLLECTION/ })).toHaveAttribute("href", "/shop");
    expect(within(hero).queryByRole("link", { name: /SHOP THE DROP/ }) !== null).toBe(drop?.state === "live");
    expect(within(hero).queryByRole("button", { name: /NOTIFY ME/ }) !== null).toBe(drop?.state === "upcoming");
    // The scroll hint and the later chapters belong to the moving version only.
    expect(within(hero).queryByText(/Scroll to put Guåhan together/i)).not.toBeInTheDocument();
    expect(within(hero).queryByRole("heading", { name: brand.storyHeading[0] })).not.toBeInTheDocument();
    view.unmount();
  }
});

it("shows its first screen before the catalog arrives", () => {
  show();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(brand.tagline);
  expect(screen.getByRole("link", { name: /SHOP THE COLLECTION/ })).toBeVisible();
  expect(screen.getByRole("status", { name: "Loading the collection" })).toBeInTheDocument();
});

it("keeps the classic home's collection, drop and story below the puzzle", () => {
  const { container } = show(storefront(featured("upcoming")));
  expect(screen.getByRole("heading", { name: "The core collection" })).toBeVisible();
  expect(container.querySelector(".home-drop")).not.toBeNull();
  expect(screen.getByRole("heading", { name: /Tåno is land.\s*Tåsi is sea./ })).toBeVisible();
  // One alert form on the page, as on the classic home.
  expect(screen.getAllByLabelText("Email for drop alerts")).toHaveLength(1);
});

it("opens the drop alert in place from the hero", async () => {
  show(storefront(featured("upcoming")));
  await userEvent.click(within(document.querySelector<HTMLElement>(".puzzle-hero")!).getByRole("button", { name: /NOTIFY ME/ }));
  const dialog = screen.getByRole("dialog", { name: "Get notified" });
  expect(within(dialog).getByRole("heading", { name: products[1].name })).toBeVisible();
});

it("finds a village on the map and says so", async () => {
  const { container } = show(storefront(null));
  const section = container.querySelector<HTMLElement>(".village-piece")!;
  expect(within(section).getAllByText("The whole island of Guåhan.")[0]).toBeVisible();
  await userEvent.selectOptions(within(section).getByLabelText("Choose a village"), "hagat");
  expect(section).toHaveAttribute("data-village", "hagat");
  expect(within(section).getByRole("status")).toHaveTextContent("Hågat on the Guåhan map.");
  expect(within(section).getByRole("link", { name: /VIEW THE MAP/ })).toHaveAttribute("href", "/products/guahan-sunset-map");
});
