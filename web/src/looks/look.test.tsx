import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { initializeLook, LOOK_STORAGE_KEY } from "./look";
import { PreviewBar } from "./PreviewBar";
import { Wordmark } from "../components/Shared";
import { MissionBand } from "./LookHome";

beforeEach(() => { sessionStorage.clear(); initializeLook({ pathname: "/", search: "?look=off" }); });
afterEach(() => { act(() => { initializeLook({ pathname: "/", search: "?look=off" }); }); });
it.each(["1", "2", "3"])("sets and persists look %s before rendering, then restores it on other URLs", (look) => {
  initializeLook({ pathname: "/products/example", search: `?look=${look}` });
  expect(document.documentElement).toHaveAttribute("data-look", look);
  expect(sessionStorage.getItem(LOOK_STORAGE_KEY)).toBe(look);
  initializeLook({ pathname: "/shop", search: "" });
  expect(document.documentElement).toHaveAttribute("data-look", look);
});
it("off clears the session and removes the attribute", () => {
  initializeLook({ pathname: "/", search: "?look=2" });
  initializeLook({ pathname: "/shop", search: "?look=off" });
  expect(sessionStorage.getItem(LOOK_STORAGE_KEY)).toBeNull();
  expect(document.documentElement).not.toHaveAttribute("data-look");
  initializeLook({ pathname: "/", search: "" });
  expect(document.documentElement).not.toHaveAttribute("data-look");
});
it.each(["", "?look=0", "?look=4", "?look=01", "?look=banana"])("keeps the default unchanged for %s with no saved look", (search) => {
  initializeLook({ pathname: "/", search });
  render(<MemoryRouter><PreviewBar /><Wordmark /></MemoryRouter>);
  expect(document.documentElement).not.toHaveAttribute("data-look");
  expect(screen.queryByRole("navigation", { name: "Design preview" })).not.toBeInTheDocument();
  expect(screen.getByText("TÅNO + TÅSI")).toHaveClass("wordmark");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("ignores invalid input while retaining a valid saved look", () => {
  sessionStorage.setItem(LOOK_STORAGE_KEY, "1");
  initializeLook({ pathname: "/", search: "?look=9" });
  expect(document.documentElement).toHaveAttribute("data-look", "1");
});
it("marks the active look and keeps path, other params, and anchor in every link", () => {
  initializeLook({ pathname: "/drops/drop-001", search: "?look=2" });
  render(<MemoryRouter initialEntries={["/drops/drop-001?mockDrop=live&look=2#notify"]}><PreviewBar /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Look 2 Sun & Hill" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("link", { name: "Look 1 Island Supply" })).toHaveAttribute("href", "/drops/drop-001?mockDrop=live&look=1#notify");
  expect(screen.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/drops/drop-001?mockDrop=live&look=off#notify");
});
it.each(["/admin", "/admin/", "/admin/products", "/Admin", "/ADMIN/products"])("leaves %s unaffected and restores the preview on returning to the shop", (pathname) => {
  initializeLook({ pathname: "/", search: "?look=1" });
  initializeLook({ pathname, search: "?look=off" });
  render(<MemoryRouter initialEntries={[pathname]}><PreviewBar /><Wordmark /></MemoryRouter>);
  expect(document.documentElement).not.toHaveAttribute("data-look");
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(sessionStorage.getItem(LOOK_STORAGE_KEY)).toBe("1");
  act(() => { initializeLook({ pathname: "/shop", search: "" }); });
  expect(document.documentElement).toHaveAttribute("data-look", "1");
});
it("can preview and exit when session storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => initializeLook({ pathname: "/", search: "?look=3" })).not.toThrow();
  expect(document.documentElement).toHaveAttribute("data-look", "3");
  initializeLook({ pathname: "/shop", search: "" });
  expect(document.documentElement).toHaveAttribute("data-look", "3");
  initializeLook({ pathname: "/", search: "?look=off" });
  expect(document.documentElement).not.toHaveAttribute("data-look");
  vi.restoreAllMocks();
});
it("exposes mission text once and hides the duplicate marquee track", () => {
  const { container } = render(<MissionBand moving />);
  expect(container.querySelectorAll('.mission-track-copy[aria-hidden="true"]')).toHaveLength(1);
  expect(container.querySelector('.mission-track-copy:not([aria-hidden])')).toHaveTextContent("Keeping us connected to where we come from.");
});
