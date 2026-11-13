import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SpinBox } from "./SpinBox";
import { ProductCard } from "./Shared";
import { catalog, CORE, MAP } from "../mocks/data";

const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
const box = product.box!;
const body = (container: HTMLElement) => container.querySelector<HTMLElement>(".spin-box-body")!;
const angleOf = (container: HTMLElement) => Number(/rotateY\((-?[\d.]+)deg\)/.exec(body(container).style.transform)![1]);
let clock = 0;
// `at` is the event's time in ms; left out, each event comes a millisecond after the last.
function pointer(target: Element, type: string, x: number, pointerType = "touch", at = clock + 1) {
  clock = at;
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, clientX: x, clientY: 0, button: 0, pointerType, timeStamp: at }).map(([key, value]) => [key, { value }])));
  fireEvent(target, event);
}

it("folds the four faces into a box whose depth comes from its side", () => {
  const { container } = render(<SpinBox box={box} />);
  expect(screen.getByAltText(box.front.alt)).toHaveClass("spin-box-front");
  // The back is only described where the button can turn to it.
  expect(screen.queryByAltText(box.back.alt)).toBeNull();
  expect(container.querySelector("img.spin-box-back")).toHaveAttribute("alt", "");
  // 1:5 sides on a 4:3 front make the box 15% as deep as it is wide.
  expect(container.querySelector<HTMLElement>(".spin-box")!.style.getPropertyValue("--box-depth")).toBe("0.15");
  expect(container.querySelectorAll("img.spin-box-left, img.spin-box-right")).toHaveLength(2);
});

it("stands in plain sides when the box has only a front and a back", () => {
  const { container } = render(<SpinBox box={{ ...box, left: null, right: null }} />);
  expect(container.querySelectorAll("span.spin-box-left, span.spin-box-right")).toHaveLength(2);
  expect(container.querySelector<HTMLElement>(".spin-box")!.style.getPropertyValue("--box-depth")).toBe("0.14");
});

it("turns to the back and to the front again with the button", () => {
  const { container } = render(<SpinBox box={box} controls />);
  expect(screen.getByAltText(box.back.alt)).toHaveClass("spin-box-back");
  expect(body(container).style.transform).toBe("rotateY(-24deg)");
  fireEvent.click(screen.getByRole("button", { name: "SHOW THE BACK" }));
  expect(body(container).style.transform).toBe("rotateY(156deg)");
  fireEvent.click(screen.getByRole("button", { name: "SHOW THE FRONT" }));
  expect(body(container).style.transform).toBe("rotateY(336deg)");
});

it("follows a sideways drag, stays where it is let go, and doesn't open the product", () => {
  const opened = vi.fn();
  const { container } = render(<MemoryRouter><div onClick={opened}><ProductCard product={product} /></div></MemoryRouter>);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100);
  pointer(stage, "pointermove", 110);
  pointer(stage, "pointermove", 210);
  expect(body(container).style.transform).toBe("rotateY(36deg)");
  // Held still before the let-go, so there is no flick to carry it on.
  pointer(stage, "pointerup", 210, "touch", 500);
  expect(body(container).style.transform).toBe("rotateY(36deg)");
  // The click that ends a drag is swallowed; the next one is a real tap.
  fireEvent.click(stage);
  expect(opened).not.toHaveBeenCalled();
  fireEvent.click(stage);
  expect(opened).toHaveBeenCalledOnce();
});

it("glides on after a flick and slows to a stop", () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<SpinBox box={box} />);
    const stage = container.querySelector(".spin-box-stage")!;
    pointer(stage, "pointerdown", 100, "touch", 0);
    pointer(stage, "pointermove", 110, "touch", 16);
    pointer(stage, "pointermove", 150, "touch", 32);
    pointer(stage, "pointermove", 190, "touch", 48);
    pointer(stage, "pointerup", 190, "touch", 56);
    const let_go = angleOf(container);
    expect(let_go).toBe(24);
    vi.advanceTimersByTime(200);
    const gliding = angleOf(container);
    expect(gliding).toBeGreaterThan(let_go + 20);
    vi.advanceTimersByTime(4000);
    const stopped = angleOf(container);
    expect(stopped).toBeGreaterThan(gliding);
    vi.advanceTimersByTime(1000);
    expect(angleOf(container)).toBe(stopped);
  } finally { vi.useRealTimers(); }
});

it("doesn't flick on when the browser takes the press away for a scroll", () => {
  const { container } = render(<SpinBox box={box} />);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100, "touch", 0);
  pointer(stage, "pointermove", 110, "touch", 16);
  pointer(stage, "pointermove", 150, "touch", 32);
  pointer(stage, "pointercancel", 150, "touch", 40);
  expect(angleOf(container)).toBe(0);
  // Nothing is left running to carry it on.
  expect(container.querySelector<HTMLElement>(".spin-box-body")!.style.transition).toBe("none");
});

it("eases off an edge-on pose, where the box would be a sliver", () => {
  const { container } = render(<SpinBox box={box} />);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100);
  pointer(stage, "pointermove", 110);
  // 180px at 0.6 degrees a pixel: from -24 to 84, six degrees short of edge-on.
  pointer(stage, "pointermove", 290);
  expect(body(container).style.transform).toBe("rotateY(84deg)");
  pointer(stage, "pointerup", 290, "touch", 500);
  expect(body(container).style.transform).toBe("rotateY(70deg)");
});

it("turns to the face it isn't showing from wherever it was left", () => {
  const { container } = render(<SpinBox box={box} controls />);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100);
  pointer(stage, "pointermove", 110);
  // To 126 degrees: the back is showing.
  pointer(stage, "pointermove", 360);
  pointer(stage, "pointerup", 360, "touch", 500);
  expect(body(container).style.transform).toBe("rotateY(126deg)");
  fireEvent.click(screen.getByRole("button", { name: "SHOW THE FRONT" }));
  expect(body(container).style.transform).toBe("rotateY(336deg)");
  expect(screen.getByRole("button", { name: "SHOW THE BACK" })).toBeVisible();
});

it("ends a press that is released away from the box, so the next click still opens the product", () => {
  vi.useFakeTimers();
  try {
    const opened = vi.fn();
    const { container } = render(<MemoryRouter><div onClick={opened}><ProductCard product={product} /></div></MemoryRouter>);
    const stage = container.querySelector(".spin-box-stage")!;
    pointer(stage, "pointerdown", 100, "mouse");
    pointer(stage, "pointermove", 110, "mouse");
    pointer(stage, "pointermove", 140, "mouse");
    // The release lands elsewhere; the stage only hears that it lost the pointer.
    pointer(stage, "lostpointercapture", 140, "mouse", 900);
    expect(body(container).style.transform).toBe("rotateY(-6deg)");
    // Moving back over it with no button down must not turn it.
    pointer(stage, "pointermove", 300, "mouse");
    expect(body(container).style.transform).toBe("rotateY(-6deg)");
    // No click followed that drag, so a later one (a keyboard Enter on the link, say) goes through.
    vi.advanceTimersByTime(100);
    fireEvent.click(stage);
    expect(opened).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it("keeps swallowing a drag's click when the drag starts right after another press", () => {
  vi.useFakeTimers();
  try {
    const opened = vi.fn();
    const { container } = render(<MemoryRouter><div onClick={opened}><ProductCard product={product} /></div></MemoryRouter>);
    const stage = container.querySelector(".spin-box-stage")!;
    pointer(stage, "pointerdown", 100, "mouse");
    pointer(stage, "pointerup", 100, "mouse");
    // A second press inside the first one's 80 ms window turns into a drag.
    vi.advanceTimersByTime(40);
    pointer(stage, "pointerdown", 100, "mouse");
    pointer(stage, "pointermove", 110, "mouse");
    vi.advanceTimersByTime(60);
    pointer(stage, "pointermove", 300, "mouse");
    pointer(stage, "pointerup", 300, "mouse");
    fireEvent.click(stage);
    expect(opened).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("focuses the card's link on a mouse press, and leaves other buttons alone", () => {
  const { container } = render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>);
  const stage = container.querySelector(".spin-box-stage")!;
  expect(fireEvent.mouseDown(stage, { button: 1 })).toBe(true);
  expect(fireEvent.mouseDown(stage, { button: 0 })).toBe(false);
  expect(container.querySelector("a")).toHaveFocus();
});
