import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { HeroEntrance, LOOK5_HERO_SEEN } from "./HeroEntrance";

afterEach(() => vi.useRealTimers());
it("marks only the four first-commit items and never replays after refetch or remount", () => {
  vi.useFakeTimers();
  const { container, rerender, unmount } = render(<StrictMode><HeroEntrance><img alt="Logo" src="/images/brand/logo-preview-1200.webp" /><h1>Home</h1><p>Mission</p><div>Actions</div></HeroEntrance></StrictMode>);
  expect(container.querySelectorAll("[data-enter-item]")).toHaveLength(4);
  expect(container.firstChild).toHaveAttribute("data-enter", "once");
  expect(sessionStorage.getItem(LOOK5_HERO_SEEN)).toBe("true");
  rerender(<StrictMode><HeroEntrance><img alt="Logo" src="/images/brand/logo-preview-1200.webp" /><h1>Home</h1><p>Mission</p><div>Actions</div><p>Late release</p></HeroEntrance></StrictMode>);
  expect(screen.getByText("Late release")).not.toHaveAttribute("data-enter-item");
  act(() => { vi.advanceTimersByTime(400); });
  expect(container.firstChild).not.toHaveAttribute("data-enter");
  unmount();
  const next = render(<HeroEntrance><h1>Back home</h1></HeroEntrance>);
  expect(next.container.firstChild).not.toHaveAttribute("data-enter");
  expect(screen.getByRole("heading")).not.toHaveAttribute("data-enter-item");
});
it("keeps children visible and still when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  const { container } = render(<HeroEntrance><h1>Home</h1></HeroEntrance>);
  expect(screen.getByRole("heading")).toBeVisible();
  expect(container.firstChild).not.toHaveAttribute("data-enter");
});
