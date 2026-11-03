import { mockSalesOpen, setMockSalesOpen } from "./data";
import type { StorePage, StoreSettings } from "../types";

const settings: Omit<StoreSettings, "sales_open"> = {
  contact_email: "shimizutechnology@gmail.com",
  tagline: "A piece of home.",
  secondary_tagline: "Grounded by land, guided by sea.",
  story: "Land and sea define our islands, but our culture extends beyond their shores. Tåno y Tåsi exists to keep us connected to where we come from, carrying a piece of home wherever we are.",
  mission_lines: ["Keeping us connected to where we come from.", "Carrying a piece of home wherever we are."],
};
export const mockStore = (): StoreSettings => ({ ...settings, sales_open: mockSalesOpen() });
export function updateMockStore(patch: Partial<StoreSettings>) {
  const { sales_open, ...rest } = patch;
  if (sales_open !== undefined) setMockSalesOpen(sales_open);
  Object.assign(settings, rest);
}
const page = (slug: string, title: string, body: string): StorePage => ({ slug, title, body, updated_at: "2026-11-04T00:00:00Z" });
export const mockPages: StorePage[] = [
  page("shipping", "Shipping", "Every order ships from the United States.\n\n## Where we ship\n\nAll 50 states and the U.S. territories."),
  page("returns", "Returns & refunds", "We want you to love what you ordered.\n\n## Damaged items\n\nEmail {{contact_email}} within 30 days.\n\n- Replacement\n- Or a refund"),
  page("privacy", "Privacy policy", "We don't sell your personal information."),
  page("terms", "Terms", "See our [returns policy](/info/returns)."),
];
