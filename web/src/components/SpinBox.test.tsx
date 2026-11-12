import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SpinBox } from "./SpinBox";
import { ProductCard } from "./Shared";
import { catalog, CORE, MAP } from "../mocks/data";

const product = catalog("upcoming", { [CORE]: 40, [MAP]: 100 })[0];
const box = product.box!;
const body = (container: HTMLElement) => container.querySelector<HTMLElement>(".spin-box-body")!;
function pointer(target: Element, type: string, x: number, pointerType = "touch") {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, clientX: x, clientY: 0, button: 0, pointerType }).map(([key, value]) => [key, { value }])));
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

it("follows a sideways drag, rests on the nearer face, and doesn't open the product", () => {
  const opened = vi.fn();
  const { container } = render(<MemoryRouter><div onClick={opened}><ProductCard product={product} /></div></MemoryRouter>);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100);
  pointer(stage, "pointermove", 110);
  pointer(stage, "pointermove", 310);
  expect(body(container).style.transform).toBe("rotateY(96deg)");
  pointer(stage, "pointerup", 310);
  expect(body(container).style.transform).toBe("rotateY(156deg)");
  // The click that ends a drag is swallowed; the next one is a real tap.
  fireEvent.click(stage);
  expect(opened).not.toHaveBeenCalled();
  fireEvent.click(stage);
  expect(opened).toHaveBeenCalledOnce();
});

it("leaves a finger's swipe to the gallery when touch dragging is off", () => {
  const { container } = render(<SpinBox box={box} controls touchDrag={false} />);
  const stage = container.querySelector(".spin-box-stage")!;
  pointer(stage, "pointerdown", 100);
  pointer(stage, "pointermove", 300);
  expect(body(container).style.transform).toBe("rotateY(-24deg)");
  pointer(stage, "pointerup", 300);
  pointer(stage, "pointerdown", 100, "mouse");
  pointer(stage, "pointermove", 110, "mouse");
  pointer(stage, "pointermove", 160, "mouse");
  expect(body(container).style.transform).toBe("rotateY(6deg)");
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
    pointer(stage, "lostpointercapture", 140, "mouse");
    expect(body(container).style.transform).toBe("rotateY(-24deg)");
    // Moving back over it with no button down must not turn it.
    pointer(stage, "pointermove", 300, "mouse");
    expect(body(container).style.transform).toBe("rotateY(-24deg)");
    // No click followed that drag, so a later one (a keyboard Enter on the link, say) goes through.
    vi.advanceTimersByTime(100);
    fireEvent.click(stage);
    expect(opened).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
