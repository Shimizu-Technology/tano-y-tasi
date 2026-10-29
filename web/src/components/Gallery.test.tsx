import { act, fireEvent, render, screen } from "@testing-library/react";
import { Gallery } from "./Gallery";
import { catalog, CORE, MAP } from "../mocks/data";

const images = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0].images;

it("stays on a valid image when a refreshed product has fewer images", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  try {
    const { container, rerender } = render(<Gallery images={images} name="Puzzle" />);
    const track = container.querySelector<HTMLElement>(".gallery-track")!;
    Object.defineProperty(track, "clientWidth", { value: 100, configurable: true });
    track.scrollLeft = 100 * (images.length - 1);
    fireEvent.scroll(track);
    expect(screen.getByText(`${images.length} / ${images.length}`)).toBeInTheDocument();

    rerender(<Gallery images={images.slice(0, 2)} name="Puzzle" />);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    rerender(<Gallery images={[]} name="Puzzle" />);
    expect(container.querySelector(".gallery")).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

function gesture(target: Element, type: string, x: number, y: number, time: number, id = 1) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: id, clientX: x, clientY: y, button: 0, timeStamp: time, pointerType: "touch" }).map(([key, value]) => [key, { value }])));
  fireEvent(target, event);
}
it("anchors double-tap and pinch, pans with transforms, caps zoom, and resets on image swap", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  const { container } = render(<Gallery images={[{ ...images[0], aspect: "2:3" }, ...images.slice(1)]} name="Puzzle" />);
  fireEvent.click(screen.getByRole("button", { name: "View image 1 of Puzzle" }));
  const canvas = container.querySelector<HTMLElement>(".viewer-canvas")!;
  const art = container.querySelector<HTMLElement>(".viewer-art")!;
  Object.defineProperties(canvas, { clientWidth: { value: 400 }, clientHeight: { value: 600 } });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
  gesture(canvas, "pointerdown", 100, 200, 0);
  gesture(canvas, "pointerup", 100, 200, 10);
  gesture(canvas, "pointerdown", 100, 200, 100);
  gesture(canvas, "pointerup", 100, 200, 110);
  expect(art.style.transform).toBe("translate(-150px, -300px) scale(2.5)");
  expect(art.style.width).toBe("");
  expect(art.style.height).toBe("");
  // A browser's compatibility dblclick must not toggle a touch double-tap twice.
  fireEvent.doubleClick(canvas, { clientX: 100, clientY: 200 });
  expect(art.style.transform).toContain("scale(2.5)");
  gesture(canvas, "pointerdown", 100, 200, 400);
  gesture(canvas, "pointermove", 120, 210, 420);
  gesture(canvas, "pointerup", 120, 210, 430);
  expect(art.style.transform).toBe("translate(-130px, -290px) scale(2.5)");
  gesture(canvas, "pointerdown", 100, 200, 600);
  gesture(canvas, "pointerdown", 200, 200, 610, 2);
  gesture(canvas, "pointermove", 400, 200, 620, 2);
  expect(screen.getByRole("slider")).toHaveValue("4");
  expect(art.style.transform).toBe("translate(-198px, -584px) scale(4)");
  gesture(canvas, "pointercancel", 400, 200, 630, 2);
  gesture(canvas, "pointerup", 100, 200, 640);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
  expect(art.style.transform).toBe("translate(0px, 0px) scale(1)");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
  fireEvent.click(screen.getByText("NEXT"));
  expect(screen.getByRole("slider")).toHaveValue("1");
  expect(container.querySelector<HTMLElement>(".viewer-art")!.style.transform).toBe("");
});

it("keeps zoomed artwork on screen when the viewer is resized (phone rotation)", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  let resized: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
  try {
    const { container, unmount } = render(<Gallery images={[{ ...images[0], aspect: "2:3" }, ...images.slice(1)]} name="Puzzle" />);
    fireEvent.click(screen.getByRole("button", { name: "View image 1 of Puzzle" }));
    const canvas = container.querySelector<HTMLElement>(".viewer-canvas")!;
    const art = container.querySelector<HTMLElement>(".viewer-art")!;
    let size = { width: 400, height: 600 };
    Object.defineProperties(canvas, {
      clientWidth: { get: () => size.width, configurable: true },
      clientHeight: { get: () => size.height, configurable: true },
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    gesture(canvas, "pointerdown", 100, 200, 0);
    gesture(canvas, "pointermove", 0, 0, 20);
    gesture(canvas, "pointerup", 0, 0, 30);
    const before = art.style.transform;
    // Portrait 400×600 → landscape 844×390: a 2:3 image fits 260×390, so at 4× its
    // left edge may sit between −1364px and −1168px for the art to cover the canvas.
    size = { width: 844, height: 390 };
    act(() => resized());
    const [x, y] = art.style.transform.match(/-?[\d.]+(?=px)/g)!.map(Number);
    expect(art.style.transform).not.toBe(before);
    expect(art.style.transform).toContain("scale(4)");
    expect(x).toBeGreaterThanOrEqual(-1364);
    expect(x).toBeLessThanOrEqual(-1168);
    expect(y).toBeGreaterThanOrEqual(-1170);
    expect(y).toBeLessThanOrEqual(0);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("ignores a resize that lands after the viewer has closed", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  let resized: () => void = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() {}
  });
  try {
    const { container, unmount } = render(<Gallery images={images} name="Puzzle" />);
    fireEvent.click(screen.getByRole("button", { name: "View image 1 of Puzzle" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
    expect(container.querySelector(".viewer-canvas")).not.toBeNull();
    unmount();
    expect(() => resized()).not.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
