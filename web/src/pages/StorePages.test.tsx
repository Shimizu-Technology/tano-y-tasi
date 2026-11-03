import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Archive, Info, Shop, Story } from "./StorePages";
import { catalog, CORE, MAP, dropSummary } from "../mocks/data";
import type { Drops, Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const storefront: Storefront = {
  featured_drop: { ...dropSummary("upcoming"), product: products[1] },
  core_products: [products[0]],
  server_time: "2026-10-29T00:00:00Z",
};
function show(path: string, data = storefront, drops?: Drops) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["storefront"], data);
  if (drops) client.setQueryData(["drops"], drops);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shop" element={<Shop />} />
          <Route path="/info/:topic" element={<Info />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/story" element={<Story />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
it("previews the API's upcoming drop when the archive is empty, without a hardcoded release", () => {
  const upcoming = { ...dropSummary("upcoming"), number: 8, name: "Next island puzzle", slug: "drop-008", release_at: "2027-01-09T00:00:00Z", product: products[1] };
  show("/archive", storefront, { current: null, upcoming: [upcoming], archive: [], server_time: storefront.server_time });
  expect(screen.getByRole("heading", { name: upcoming.name })).toBeVisible();
  expect(screen.getByText("Drop 008 · Upcoming")).toBeVisible();
  expect(screen.getByText("Sat, Jan 9, 10:00 AM ChST")).toHaveAttribute("dateTime", upcoming.release_at);
  expect(screen.getByRole("link", { name: "Meet Drop 008" })).toHaveAttribute("href", "/drops/drop-008");
});

it("keeps past drops in the archive grid instead of showing the upcoming preview", () => {
  const closed = { ...dropSummary("closed"), product: products[1] };
  const { container } = show("/archive", storefront, { current: null, upcoming: [{ ...dropSummary("upcoming"), product: products[1] }], archive: [closed], server_time: storefront.server_time });
  expect(container.querySelector(".product-grid .archive-card")).toBeInTheDocument();
  expect(screen.getByText("CLOSED")).toBeVisible();
  expect(screen.queryByText(/Upcoming/)).not.toBeInTheDocument();
});

it("does not invent a first-drop announcement when no upcoming drop exists", () => {
  show("/archive", storefront, { current: null, upcoming: [], archive: [], server_time: storefront.server_time });
  expect(screen.getByText("No past drops yet.")).toBeVisible();
  expect(screen.queryByRole("link", { name: /Meet Drop/ })).not.toBeInTheDocument();
});

it("keeps a live first drop visible when it has not entered the archive yet", () => {
  const current = { ...dropSummary("live"), product: products[1] };
  show("/archive", storefront, { current, upcoming: [], archive: [], server_time: storefront.server_time });
  expect(screen.getByText("Drop 001 · Available now")).toBeVisible();
  expect(screen.getByRole("link", { name: "Meet Drop 001" })).toHaveAttribute("href", `/drops/${current.slug}`);
});

it("keeps the approved Story copy and places its collection action with the puzzle content", () => {
  const { container } = show("/story");
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByText(/We start with puzzles of Guåhan/)).toBeVisible();
  const section = container.querySelector(".story-puzzles")!;
  expect(section.querySelector("a")).toHaveAttribute("href", "/shop");
  expect(section.querySelector("img")).toHaveAttribute("src", expect.stringContaining("finished-flat"));
});
it.each([1, 2])("uses a plain Shop heading and a neutral item count for %i products", (count) => {
  show("/shop", { ...storefront, core_products: products.slice(0, count) });
  expect(screen.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
  expect(screen.getByText(`${count} ${count === 1 ? "item" : "items"}`)).toBeVisible();
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
  expect(screen.getByText("The next release date has not been announced. Join the list and you'll hear first.")).toBeVisible();
  expect(screen.queryByText(/limited to/)).not.toBeInTheDocument();
});
it("publishes only the known shipping calculation and destinations", () => {
  show("/info/shipping");
  expect(screen.getByText("Shipping is calculated at checkout. We ship to the United States, Guam and Puerto Rico.")).toBeVisible();
  expect(screen.queryByText(/placeholder|returns policy/i)).not.toBeInTheDocument();
});
