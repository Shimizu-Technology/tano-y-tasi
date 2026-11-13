import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DropPage, ProductPage } from "./ProductPage";
import { catalog, CORE, DROP, dropSummary, MAP } from "../mocks/data";
import type { Drop, ProductDetail } from "../types";

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
    expect(screen.getByText("Shipping is calculated at checkout. We ship to all 50 states, Guam, Puerto Rico and the other U.S. territories.")).toBeVisible();
    expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeEnabled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("offers the alert in a dialog, in place of a buy button, for a product that isn't out yet", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const subscribed = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    subscribed(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ subscribed: true }), { status: 201, headers: { "Content-Type": "application/json" } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  product.availability = { ...product.availability, state: "coming_soon", purchasable: false };
  client.setQueryData(["product", CORE], { product, server_time: "2026-10-29T00:00:00Z" });
  try {
    const { container } = render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/products/${CORE}`]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
    expect(container.querySelector(".product-state")).toHaveTextContent("COMING SOON");
    expect(screen.queryByRole("button", { name: /ADD TO CART|COMING SOON/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Quantity" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "NOTIFY ME" }));
    const dialog = screen.getByRole("dialog", { name: "Get notified" });
    expect(within(dialog).getByRole("heading", { name: product.name })).toBeVisible();
    // The email field takes focus, so one tap and typing is all it takes.
    expect(within(dialog).getByLabelText("Email for drop alerts")).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText("Email for drop alerts"), "soon@example.com{Enter}");
    expect(await within(dialog).findByRole("status")).toHaveTextContent("You’re on the list.");
    expect(subscribed).toHaveBeenCalledWith({ email: "soon@example.com", source: "product" });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("shows a spec only after its placeholder flag is cleared, and hides an empty Details section", () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  const renderPage = () =>
    render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/products/${CORE}`]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
  try {
    client.setQueryData(["product", CORE], {
      product: { ...product, placeholders: ["specs.cut", "specs.made_in", "art.credit"] },
      server_time: "2026-10-29T00:00:00Z",
    });
    const first = renderPage();
    expect(screen.getByText("Pieces")).toBeInTheDocument();
    expect(screen.queryByText("Cut")).not.toBeInTheDocument();
    expect(screen.queryByText("Made in")).not.toBeInTheDocument();
    expect(screen.queryByText(product.art.credit)).not.toBeInTheDocument();
    first.unmount();

    const keys = ["piece_count", "finished_size", "box_size", "material", "cut", "made_in"].map((k) => `specs.${k}`);
    client.setQueryData(["product", CORE], { product: { ...product, placeholders: keys }, server_time: "2026-10-29T00:00:00Z" });
    renderPage();
    expect(screen.queryByText("Details", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("What’s in the box")).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("hides what's in the box while the catalog marks it unconfirmed", () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  client.setQueryData(["product", CORE], { product: { ...product, placeholders: ["includes"] }, server_time: "2026-10-29T00:00:00Z" });
  try {
    render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/products/${CORE}`]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
    expect(screen.queryByText("What’s in the box")).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("renders a new product that has only its required fields", () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const base = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
  const product = { ...base, slug: "new-tee", name: "Island Tee", specs: {}, includes: [], art: {}, placeholders: [] } as unknown as typeof base;
  client.setQueryData(["product", "new-tee"], { product, server_time: "2026-10-29T00:00:00Z" });
  try {
    render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={["/products/new-tee"]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
    expect(screen.getByRole("heading", { name: "Island Tee" })).toBeVisible();
    expect(screen.queryByText("The art")).not.toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.getByText("Shipping", { exact: true })).toBeVisible();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("commerce states", () => {
  const server_time = "2026-10-29T00:00:00Z";
  const [core, map] = catalog("live", { [CORE]: 40, [MAP]: 100 });
  beforeEach(() => vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} }));
  afterEach(() => vi.unstubAllGlobals());
  function showProduct(product: ProductDetail) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["product", product.slug], { product, server_time });
    return render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/products/${product.slug}`]}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
  }
  function showDrop(drop: Drop) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["drop", drop.slug], { drop, server_time, receivedAt: Date.parse(server_time) });
    return render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/drops/${drop.slug}`]}>
        <Routes><Route path="/drops/:slug" element={<DropPage />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    );
  }
  const preorder: ProductDetail = { ...core, preorder: true, preorder_ships: "Ships late January 2027", per_customer_limit: 2, max_per_order: 2,
    availability: { ...core.availability, state: "preorder", purchasable: true } };

  it("sells a preorder with its ship date and its limit", () => {
    showProduct(preorder);
    expect(screen.getByRole("button", { name: "PREORDER" })).toBeEnabled();
    expect(screen.getByText("Ships late January 2027")).toBeVisible();
    expect(screen.getByText("Limit 2 per customer")).toBeVisible();
  });
  it("doesn't promise a ship date once a preorder has sold out", () => {
    showProduct({ ...preorder, max_per_order: 0, availability: { ...core.availability, state: "sold_out", purchasable: false } });
    expect(screen.getByRole("button", { name: "SOLD OUT" })).toBeDisabled();
    expect(screen.queryByText("Ships late January 2027")).not.toBeInTheDocument();
  });
  it("labels a signature product on its page", () => {
    showProduct({ ...core, signature: true });
    expect(screen.getByText("SIGNATURE")).toBeVisible();
  });
  it("shows a product's own limit in a drop, over the drop's", () => {
    showProduct({ ...map, per_customer_limit: 1, max_per_order: 1 });
    expect(screen.getByText(/Limit 1 per customer/)).toBeVisible();
    expect(screen.getByRole("link", { name: "DROP 001" })).toHaveAttribute("href", `/drops/${DROP}`);
  });
  it("keeps the product page for a drop with one product", () => {
    showDrop({ ...dropSummary("live"), product: map, products: [map] });
    expect(screen.getByRole("heading", { level: 1, name: map.name })).toBeVisible();
    expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeEnabled();
    expect(document.querySelector(".core-collection")).not.toBeInTheDocument();
  });
  it("keeps the product page when an older API sends no products list", () => {
    showDrop({ ...dropSummary("live"), product: map });
    expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeEnabled();
  });
  it("shows a drop with several products as a heading and a grid linking to each", () => {
    const night = { ...map, slug: "night", name: "Night Map", box: null };
    showDrop({ ...dropSummary("live"), product: map, products: [map, night] });
    expect(screen.getByRole("heading", { level: 1, name: "Guåhan Sunset Map" })).toBeVisible();
    expect(screen.getByText("DROP 001 · AVAILABLE NOW")).toBeVisible();
    expect(screen.getByText("100 made · 2 items")).toBeVisible();
    expect(screen.getByRole("link", { name: /Night Map/ })).toHaveAttribute("href", "/products/night");
    expect(screen.getByRole("link", { name: /Guåhan Sunset Map/ })).toHaveAttribute("href", `/products/${MAP}`);
    expect(screen.queryByRole("button", { name: "ADD TO CART" })).not.toBeInTheDocument();
  });
  it("hides prices and offers the list for a coming-soon drop with several products", () => {
    const summary = { ...dropSummary("upcoming"), release_at: null, quantity: null };
    const item = { ...map, drop: summary, availability: { ...map.availability, state: "upcoming" as const, purchasable: false } };
    showDrop({ ...summary, product: item, products: [item, { ...item, slug: "night", name: "Night Map" }] });
    expect(screen.getByText("DROP 001 · COMING SOON")).toBeVisible();
    expect(screen.getByText("The release date goes to the list first.")).toBeVisible();
    expect(screen.queryByText("$45")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email for drop alerts")).toBeVisible();
  });
});
