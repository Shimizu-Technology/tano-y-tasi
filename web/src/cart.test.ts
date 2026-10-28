import { useCart } from "./cart";
beforeEach(() => {
  useCart.setState({ items: [] });
  localStorage.clear();
});
it("adds and combines the same slug, bounded by the supplied current limit", () => {
  const c = useCart.getState();
  c.add("map", 1, 2);
  c.add("map", 4, 2);
  expect(useCart.getState().items).toEqual([{ product_slug: "map", quantity: 2 }]);
});
it("removes a line and bounds quantity changes", () => {
  useCart.getState().add("core", 1, 10);
  useCart.getState().set("core", 12, 10);
  expect(useCart.getState().items[0].quantity).toBe(10);
  useCart.getState().set("core", 0);
  expect(useCart.getState().items).toEqual([]);
});
it("persists only slugs and quantities and rehydrates", async () => {
  useCart.getState().add("core", 2, 10);
  const value = JSON.parse(localStorage.getItem("tyt-cart-v1")!);
  expect(value.state).toEqual({ items: [{ product_slug: "core", quantity: 2 }] });
  useCart.setState({ items: [] });
  localStorage.setItem("tyt-cart-v1", JSON.stringify(value));
  await useCart.persist.rehydrate();
  expect(useCart.getState().items).toEqual(value.state.items);
});
it("restores canceled quantities once, preserving additions", () => {
  useCart.getState().add("core", 3, 10);
  const items = [
    { product_slug: "core", quantity: 2 },
    { product_slug: "map", quantity: 1 },
  ];
  useCart.getState().restore(items);
  useCart.getState().restore(items);
  expect(useCart.getState().items).toEqual([
    { product_slug: "core", quantity: 3 },
    { product_slug: "map", quantity: 1 },
  ]);
});
it("removes purchased quantities while preserving later cart additions", () => {
  useCart.getState().add("core", 3, 10);
  useCart.getState().add("map", 1, 2);
  useCart.getState().complete([{ product_slug: "core", quantity: 2 }]);
  expect(useCart.getState().items).toEqual([
    { product_slug: "core", quantity: 1 },
    { product_slug: "map", quantity: 1 },
  ]);
});
it("rejects malformed persisted quantities", async () => {
  localStorage.setItem(
    "tyt-cart-v1",
    JSON.stringify({
      state: {
        items: [
          { product_slug: "bad", quantity: -1 },
          { product_slug: "valid", quantity: 999 },
        ],
      },
      version: 0,
    })
  );
  await useCart.persist.rehydrate();
  expect(useCart.getState().items).toEqual([{ product_slug: "valid", quantity: 10 }]);
});
