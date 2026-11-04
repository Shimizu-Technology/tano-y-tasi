import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { AdminApiContext, type AdminProduct } from "./adminApi";
import { useImageManager } from "./AdminImages";

const product = {
  slug: "map",
  images: [{ role: "hero", alt: "Map", base: "/images/map", widths: [640], aspect: "1:1" }],
} as unknown as AdminProduct;

it("keeps an edit made while images are saving, and leaves it unsaved", async () => {
  let finish: (value: unknown) => void = () => {};
  const api = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AdminApiContext.Provider value={api as never}>{children}</AdminApiContext.Provider>
  );
  const { result } = renderHook(() => useImageManager(product, () => {}), { wrapper });
  const key = result.current.items[0].key;

  act(() => result.current.change(key, { alt: "Saved text" }));
  let saving: Promise<void> | undefined;
  act(() => { saving = result.current.save(); });
  expect(result.current.saving).toBe(true);
  act(() => result.current.change(key, { alt: "Changed while saving" }));
  await act(async () => {
    finish({});
    await saving;
  });

  expect(result.current.items[0].alt).toBe("Changed while saving");
  expect(result.current.dirty).toBe(true);
  expect(result.current.message).toBe("Images saved.");
});
