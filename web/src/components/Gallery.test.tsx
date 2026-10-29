import { fireEvent, render, screen } from "@testing-library/react";
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
