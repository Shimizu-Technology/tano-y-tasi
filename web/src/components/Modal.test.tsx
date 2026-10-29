import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open</button>{open && <Modal label="Test" className="cart-dialog" swipeToDismiss onClose={() => setOpen(false)}>
    {(close) => <div><button onClick={close}>Close</button><p>Drag here</p><input aria-label="Email" /></div>}
  </Modal>}</>;
}
function open() {
  const trigger = screen.getByText("Open");
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ width: 390 } as DOMRect);
  return dialog;
}
function pointer(target: Element, type: string, x: number, y: number, time: number, id = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: id, clientX: x, clientY: y, button: 0, timeStamp: time, isPrimary: id === 1, pointerType: "touch" }).map(([key, value]) => [key, { value }])));
  fireEvent(target, event);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width") }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.style.overflow = ""; });
it.each(["button", "cancel", "backdrop"])("retains focus and scroll lock through %s exit, then restores both", (method) => {
  document.body.style.overflow = "clip";
  render(<Harness />);
  const dialog = open();
  if (method === "button") fireEvent.click(screen.getByText("Close"));
  if (method === "cancel") fireEvent(dialog, new Event("cancel", { cancelable: true }));
  if (method === "backdrop") fireEvent.click(dialog);
  expect(dialog).toHaveAttribute("data-state", "closing");
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByText("Close")).toHaveFocus();
  act(() => vi.advanceTimersByTime(159));
  expect(dialog).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(dialog).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("clip");
  expect(screen.getByText("Open")).toHaveFocus();
});
it("handles duplicate closes, immediate reopen, StrictMode and interrupted unmount without a late close", () => {
  const { unmount } = render(<StrictMode><Harness /></StrictMode>);
  open();
  fireEvent.click(screen.getByText("Close"));
  act(() => vi.advanceTimersByTime(80));
  fireEvent.click(screen.getByText("Close"));
  act(() => vi.advanceTimersByTime(80));
  expect(screen.queryByRole("dialog")).toBeNull();
  open();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "open");
  fireEvent.click(screen.getByText("Close"));
  unmount();
  act(() => vi.runAllTimers());
  expect(document.body.style.overflow).toBe("");
});
it.each([
  [118, 2000, true, "distance"], [35, 100, true, "velocity"],
  [30, 1000, false, "short slow drag"], [-150, 100, false, "wrong direction"],
])("swipe %s px in %s ms uses the %s result (%s)", (dx, duration, dismiss) => {
  render(<Harness />);
  const dialog = open();
  const content = screen.getByText("Drag here");
  pointer(content, "pointerdown", 170, 100, 10);
  pointer(dialog, "pointermove", 170 + dx, 100, 10 + duration);
  expect(dialog.setPointerCapture).toHaveBeenCalledWith(1);
  if (dx < 0) expect(parseFloat(dialog.style.transform.slice(11))).toBeGreaterThan(dx);
  pointer(dialog, "pointerup", 170 + dx, 100, 10 + duration);
  expect(dialog).toHaveAttribute("data-state", dismiss ? "closing" : "open");
  if (!dismiss) { fireEvent.click(dialog); expect(dialog).toHaveAttribute("data-state", "open"); }
  act(() => vi.advanceTimersByTime(160));
  expect(screen.queryByRole("dialog") !== null).toBe(!dismiss);
});
it("ignores extra fingers, vertical scrolling, desktop drags and form controls; cancellation snaps back", () => {
  render(<Harness />);
  const dialog = open();
  const content = screen.getByText("Drag here");
  pointer(content, "pointerdown", 10, 10, 0);
  pointer(dialog, "pointermove", 100, 10, 1000);
  // Transferring implicit capture from a child to the drawer bubbles a loss.
  pointer(content, "lostpointercapture", 100, 10, 1000);
  expect(dialog).toHaveAttribute("data-dragging");
  pointer(content, "pointerdown", 100, 10, 1001, 2);
  pointer(dialog, "pointermove", 380, 10, 1002, 2);
  pointer(dialog, "pointerup", 380, 10, 1003, 2);
  expect(dialog).toHaveAttribute("data-dragging");
  pointer(dialog, "pointercancel", 100, 10, 1004);
  expect(dialog.style.transform).toBe("");
  pointer(content, "pointerdown", 10, 10, 2000);
  pointer(dialog, "pointermove", 20, 100, 2100);
  pointer(dialog, "pointerup", 200, 100, 2101);
  pointer(screen.getByLabelText("Email"), "pointerdown", 10, 10, 3000);
  pointer(dialog, "pointermove", 300, 10, 3100);
  pointer(dialog, "pointerup", 300, 10, 3101);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  pointer(content, "pointerdown", 10, 10, 4000);
  pointer(dialog, "pointermove", 300, 10, 4100);
  pointer(dialog, "pointerup", 300, 10, 4101);
  expect(dialog).toHaveAttribute("data-state", "open");
});
it("uses a shorter opacity-only exit under reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<Harness />);
  const dialog = open();
  pointer(screen.getByText("Drag here"), "pointerdown", 10, 10, 0);
  pointer(dialog, "pointermove", 200, 10, 100);
  expect(dialog.style.transform).toBe("");
  pointer(dialog, "pointerup", 200, 10, 101);
  act(() => vi.advanceTimersByTime(100));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("keeps reduced-motion fades, removes positional motion and pulse, and progressively enhances details", () => {
  const css = readFileSync("src/styles.css", "utf8");
  expect(css).not.toMatch(/transition:\s*none\s*!important/);
  expect(css).toContain("transition-property: opacity, color, background-color, border-color");
  expect(css).toContain(".live-dot { animation: none; }");
  expect(css).toContain("@supports (interpolate-size: allow-keywords)");
  expect(css).toContain("details::details-content");
});
