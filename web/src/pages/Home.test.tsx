import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "./Home";
import { brand } from "../brand";
import { catalog, CORE, MAP, dropSummary, setMockAnnounced } from "../mocks/data";
import type { DropState, Storefront } from "../types";

const products = catalog("upcoming", { [CORE]: 40, [MAP]: 100 });
const featured = (state: DropState): Storefront["featured_drop"] => ({ ...dropSummary(state), product: products[1] });
const storefront = (drop: Storefront["featured_drop"]): Storefront => ({ featured_drop: drop, core_products: [products[0]], server_time: "2026-10-29T00:00:00Z" });
function show(data: Storefront) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["storefront"], data);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Routes><Route path="/" element={<Home />} /></Routes></MemoryRouter>
    </QueryClientProvider>
  );
}
function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
}
afterEach(() => { setMockAnnounced(true); vi.unstubAllGlobals(); });

it("leads with the brand tagline, the mission and a puzzle photo, whatever the drop does", () => {
  for (const drop of [null, featured("upcoming"), featured("live"), featured("sold_out"), featured("closed")]) {
    const view = show(storefront(drop));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(brand.tagline);
    expect(screen.getByText(brand.mission[0], { selector: ".home-mission" })).toBeVisible();
    expect(view.container.querySelector(".home-hero-art img")).toHaveAttribute("src", expect.stringContaining("finished-tabletop"));
    expect(screen.getByRole("link", { name: /SHOP THE COLLECTION/ })).toHaveAttribute("href", "/shop");
    view.unmount();
  }
});

it("shows no drop section and no drop language when no drop is announced", () => {
  const { container } = show(storefront(null));
  expect(container.querySelector(".home-drop")).toBeNull();
  expect(screen.queryByText(/DROP 00/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /NOTIFY ME|SHOP THE DROP/ })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "New drops, first." })).toBeVisible();
});

it("a dated upcoming drop shows its release in ChST and leads with the alert signup", () => {
  const { container } = show(storefront(featured("upcoming")));
  const section = container.querySelector<HTMLElement>(".home-drop")!;
  expect(within(section).getByText("Drop 001 · Releases Sat, Dec 5 · 10:00 AM ChST · 100 made")).toBeVisible();
  expect(within(section).getByLabelText("Email for drop alerts")).toBeVisible();
  expect(within(section).getByRole("button", { name: "NOTIFY ME" })).toBeVisible();
  // One alert form on the page: the drop section carries it instead of a second general list.
  expect(screen.getAllByLabelText("Email for drop alerts")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "NOTIFY ME" })).toHaveAttribute("href", "#notify");
});

it("a coming-soon drop reads anticipatory: no date, quantity or price, and the signup is the action", () => {
  setMockAnnounced(false);
  const drop = { ...featured("upcoming")!, release_at: null, quantity: null };
  const { container } = show(storefront(drop));
  const section = container.querySelector<HTMLElement>(".home-drop")!;
  expect(section).toHaveAttribute("data-drop-state", "coming_soon");
  expect(within(section).getByText("DROP 001 · COMING SOON")).toBeVisible();
  expect(within(section).getByText("The release date goes to the list first.")).toBeVisible();
  expect(within(section).getByRole("button", { name: "NOTIFY ME" })).toBeVisible();
  expect(section.textContent).not.toMatch(/ChST|made|\$\d/);
});

it("a live drop sends shoppers to the drop and keeps the general signup", () => {
  const { container } = show(storefront(featured("live")));
  const section = container.querySelector<HTMLElement>(".home-drop")!;
  expect(within(section).getByText("Drop 001 · Available now · 100 made")).toBeVisible();
  expect(within(section).getByRole("link", { name: "VIEW THE DROP" })).toHaveAttribute("href", "/drop");
  expect(screen.getByRole("link", { name: "SHOP THE DROP" })).toHaveAttribute("href", "/drop");
  expect(screen.getByRole("heading", { name: "New drops, first." })).toBeVisible();
});

it.each([["sold_out", "Drop 001 · Sold out"], ["closed", "Drop 001 · This drop has closed"]] as const)("a %s drop stays visible, without a buy or hero drop action", (state, status) => {
  const { container } = show(storefront(featured(state)));
  const section = container.querySelector<HTMLElement>(".home-drop")!;
  expect(within(section).getByText(status)).toBeVisible();
  expect(within(section).getByRole("link", { name: "VIEW THE DROP" })).toBeVisible();
  expect(screen.queryByRole("link", { name: /SHOP THE DROP|NOTIFY ME/ })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "New drops, first." })).toBeVisible();
});

it("puts the secondary tagline in the story section", () => {
  show(storefront(null));
  expect(screen.getByText(brand.secondaryTagline)).toBeVisible();
  expect(screen.getByText(brand.story)).toBeVisible();
});

it("describes the core product with its own summary when one is buyable, and omits it otherwise", () => {
  const view = show(storefront(null));
  expect(view.container.querySelector(".home-hero-caption")).toHaveTextContent(products[0].summary);
  view.unmount();
  const empty = show({ ...storefront(null), core_products: [] });
  expect(empty.container.querySelector(".home-hero-caption")).toBeNull();
});

it("the mission strip moves with a pause control and carries a hidden duplicate for the loop", async () => {
  motion(false);
  const { container } = show(storefront(null));
  const strip = container.querySelector(".mission-marquee")!;
  expect(strip).not.toHaveAttribute("tabindex");
  expect(strip.querySelectorAll(".mission-track-copy")).toHaveLength(2);
  expect(strip.querySelector('.mission-track-copy[aria-hidden="true"]')).not.toBeNull();
  const pause = screen.getByRole("button", { name: "Pause the moving mission text" });
  expect(pause).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(pause);
  expect(pause).toHaveAttribute("aria-pressed", "true");
  expect(strip).toHaveAttribute("data-paused");
});

it("with reduced motion the mission lines sit still, once, with no pause control", () => {
  motion(true);
  const { container } = show(storefront(null));
  const strip = container.querySelector(".mission-marquee")!;
  expect(strip).toHaveAttribute("data-static");
  expect(strip.querySelectorAll(".mission-track-copy")).toHaveLength(1);
  expect(strip.querySelector("[aria-hidden='true'].mission-track-copy")).toBeNull();
  expect(screen.queryByRole("button", { name: /mission text/ })).not.toBeInTheDocument();
  for (const line of [brand.tagline, ...brand.mission]) expect(within(strip as HTMLElement).getAllByText(line)).toHaveLength(1);
});

it("keeps showing the page when a background refresh fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  client.setQueryData(["storefront"], storefront(featured("upcoming")));
  render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route path="/" element={<Home />} /></Routes></MemoryRouter></QueryClientProvider>);
  await act(async () => { await vi.waitFor(() => expect(client.getQueryState(["storefront"])?.status).toBe("error")); });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(brand.tagline);
  expect(screen.queryByText("The shop is taking a moment.")).not.toBeInTheDocument();
});

it.each([null, "upcoming", "live", "sold_out", "closed"] as const)("the edge preload names exactly the image and sizes the hero renders (drop: %s)", async (state) => {
  const { transformHtml } = await import("../../netlify/lib/storefront");
  const data = storefront(state && featured(state));
  const html = transformHtml(
    "<html><head><!-- tyt:meta:start --><!-- tyt:meta:end --></head><body></body></html>",
    { snapshotTime: 0, pathname: "/", storefront: data }
  );
  const preload = new DOMParser().parseFromString(html, "text/html").querySelector("link[data-tyt-preload]")!;
  const { container } = show(data);
  const hero = container.querySelector<HTMLImageElement>("img[fetchpriority='high']")!;
  expect(hero.getAttribute("srcset")).toBe(preload.getAttribute("imagesrcset"));
  expect(hero.getAttribute("sizes")).toBe(preload.getAttribute("imagesizes"));
  expect(hero.getAttribute("loading")).toBe("eager");
  expect(preload.getAttribute("fetchpriority")).toBe("high");
});
