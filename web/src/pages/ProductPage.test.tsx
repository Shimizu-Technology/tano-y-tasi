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
