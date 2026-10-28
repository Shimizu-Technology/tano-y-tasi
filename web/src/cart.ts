import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "./types";
interface Cart {
  items: CartItem[];
  add: (slug: string, quantity: number, max: number) => void;
  set: (slug: string, quantity: number, max?: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  restore: (items: CartItem[]) => void;
  complete: (items: CartItem[]) => void;
}
export const useCart = create<Cart>()(
  persist(
    (set) => ({
      items: [],
      add: (slug, quantity, max) =>
        set((s) => {
          const old = s.items.find((i) => i.product_slug === slug)?.quantity ?? 0;
          const next = Math.min(max, old + Math.max(0, Math.floor(quantity)));
          return {
            items:
              next > 0
                ? [...s.items.filter((i) => i.product_slug !== slug), { product_slug: slug, quantity: next }]
                : s.items,
          };
        }),
      set: (slug, quantity, max = 10) =>
        set((s) => ({
          items:
            quantity > 0
              ? s.items.map((i) =>
                  i.product_slug === slug ? { ...i, quantity: Math.min(max, Math.floor(quantity)) } : i
                )
              : s.items.filter((i) => i.product_slug !== slug),
        })),
      remove: (slug) => set((s) => ({ items: s.items.filter((i) => i.product_slug !== slug) })),
      clear: () => set({ items: [] }),
      restore: (items) =>
        set((s) => ({
          items: items.reduce(
            (all, item) => {
              const existing = all.find((i) => i.product_slug === item.product_slug);
              if (existing) existing.quantity = Math.max(existing.quantity, item.quantity);
              else all.push({ product_slug: item.product_slug, quantity: item.quantity });
              return all;
            },
            s.items.map((i) => ({ ...i }))
          ),
        })),
      complete: (items) =>
        set((s) => ({
          items: s.items.flatMap((i) => {
            const qty = i.quantity - (items.find((x) => x.product_slug === i.product_slug)?.quantity ?? 0);
            return qty > 0 ? [{ ...i, quantity: qty }] : [];
          }),
        })),
    }),
    {
      name: "tyt-cart-v1",
      partialize: (s) => ({ items: s.items }),
      merge: (stored, current) => {
        const raw = (stored as { items?: CartItem[] })?.items;
        return {
          ...current,
          items: Array.isArray(raw)
            ? raw
                .filter((i) => typeof i.product_slug === "string" && Number.isInteger(i.quantity) && i.quantity > 0)
                .map((i) => ({ product_slug: i.product_slug, quantity: Math.min(i.quantity, 10) }))
            : [],
        };
      },
    }
  )
);
