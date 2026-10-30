import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router";
import { ProductArt } from "./ProductArt";
import { initializeLook } from "../looks/look";
import { catalog, CORE, MAP } from "../mocks/data";

const product = catalog("upcoming", { [CORE]: 50, [MAP]: 100 })[0];
function setup(look = "5", fine = true, alt = product.alt_image) {
  initializeLook({ pathname: "/", search: `?look=${look}` });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: fine })));
  return render(<MemoryRouter><Link to="/product"><ProductArt product={{ ...product, alt_image: alt }} /></Link></MemoryRouter>);
}
afterEach(() => {
  act(() => { initializeLook({ pathname: "/", search: "?look=off" }); });
  vi.unstubAllGlobals();
});
it.each(["pointerEnter", "focus"] as const)("loads the second image only on first %s for a fine pointer", (event) => {
  const { container } = setup();
  expect(container.querySelector(".second-view-alt")).toBeNull();
  fireEvent[event](container.querySelector("a")!);
  const image = container.querySelector(".second-view-alt")!;
  expect(image).toHaveAttribute("src", `${product.alt_image!.base}-640.webp`);
  expect(container.querySelector(".product-second-view")).not.toHaveAttribute("data-ready");
  fireEvent.load(image);
  expect(container.querySelector(".product-second-view")).toHaveAttribute("data-ready", "true");
  fireEvent.error(image);
  expect(container.querySelector(".product-second-view")).not.toHaveAttribute("data-ready");
});
it("leaves touch browsing unchanged and does not request the second image", () => {
  const { container } = setup("5", false);
  fireEvent.pointerEnter(container.querySelector("a")!);
  fireEvent.focus(container.querySelector("a")!);
  expect(container.querySelector(".second-view-alt")).toBeNull();
});
it.each(["off", "1", "2", "3", "4"])("keeps look %s's original single image markup", (look) => {
  const { container } = setup(look);
  expect(container.querySelector(".product-second-view")).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(1);
});
it("handles a missing second image with the primary view", () => {
  const { container } = setup("5", true, null);
  expect(container.querySelector(".product-second-view")).toBeNull();
  expect(container.querySelector("img")).toHaveAttribute("src", `${product.image.base}-640.webp`);
});
