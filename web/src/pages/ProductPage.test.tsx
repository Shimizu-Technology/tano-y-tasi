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
    expect(screen.getByText("Shipping is calculated at checkout. We ship to all 50 states, Guam, Puerto Rico and the other U.S. territories.")).toBeVisible();
    expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeEnabled();
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
